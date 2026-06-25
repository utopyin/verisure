import { Database } from "@verisure/db";
import { apiToken } from "@verisure/db/schema";
import type { ApiTokenRow } from "@verisure/db/schema";
import {
  decodeApiTokenRow,
  encodeApiTokenJsonFields,
} from "@verisure/interface";
import type { ApiTokenRecord } from "@verisure/interface";
import { and, eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { RepositoryError } from "./RepositoryError";

export interface CreateApiTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly credentialId: string;
  readonly displayPrefix: string;
  readonly tokenHash: string;
  readonly scopes: readonly string[];
  readonly allowedGiids?: readonly string[];
  readonly expiresAt?: Date | null;
  readonly now: Date;
}

export interface ApiTokenRepositoryShape {
  readonly create: (
    input: CreateApiTokenInput
  ) => Effect.Effect<ApiTokenRecord, RepositoryError>;
  readonly getById: (
    id: string
  ) => Effect.Effect<Option.Option<ApiTokenRecord>, RepositoryError>;
  readonly findUsableByHash: (input: {
    readonly tokenHash: string;
    readonly now: Date;
  }) => Effect.Effect<Option.Option<ApiTokenRecord>, RepositoryError>;
  readonly listForUser: (
    userId: string
  ) => Effect.Effect<readonly ApiTokenRecord[], RepositoryError>;
  readonly listForCredential: (input: {
    readonly userId: string;
    readonly credentialId: string;
  }) => Effect.Effect<readonly ApiTokenRecord[], RepositoryError>;
  readonly markUsed: (input: {
    readonly id: string;
    readonly usedAt: Date;
  }) => Effect.Effect<Option.Option<ApiTokenRecord>, RepositoryError>;
  readonly revoke: (input: {
    readonly id: string;
    readonly userId: string;
    readonly revokedAt: Date;
  }) => Effect.Effect<Option.Option<ApiTokenRecord>, RepositoryError>;
}

export class ApiTokenRepository extends Context.Service<
  ApiTokenRepository,
  ApiTokenRepositoryShape
>()("@verisure/server/ApiTokenRepository") {
  static readonly InMemory = (tokens: ApiTokenRecord[]) =>
    Layer.succeed(
      ApiTokenRepository,
      ApiTokenRepository.of({
        create: (input) => {
          const token = {
            ...(input.allowedGiids === undefined
              ? {}
              : { allowedGiids: input.allowedGiids }),
            createdAt: input.now,
            credentialId: input.credentialId,
            displayPrefix: input.displayPrefix,
            expiresAt: input.expiresAt ?? null,
            id: input.id,
            lastUsedAt: null,
            revokedAt: null,
            scopes: input.scopes,
            tokenHash: input.tokenHash,
            updatedAt: input.now,
            userId: input.userId,
          } satisfies ApiTokenRecord;
          tokens.push(token);
          return Effect.succeed(token);
        },
        findUsableByHash: (input) =>
          Effect.succeed(
            Option.fromNullishOr(
              tokens.find(
                (token) =>
                  token.tokenHash === input.tokenHash &&
                  token.revokedAt === null &&
                  (token.expiresAt === null || token.expiresAt > input.now)
              )
            )
          ),
        getById: (id) =>
          Effect.succeed(
            Option.fromNullishOr(tokens.find((token) => token.id === id))
          ),
        listForCredential: ({ credentialId, userId }) =>
          Effect.succeed(
            tokens.filter(
              (token) =>
                token.credentialId === credentialId && token.userId === userId
            )
          ),
        listForUser: (userId) =>
          Effect.succeed(tokens.filter((token) => token.userId === userId)),
        markUsed: ({ id, usedAt }) => {
          const index = tokens.findIndex((token) => token.id === id);
          const token = tokens[index];
          if (token === undefined) {
            return Effect.succeed(Option.none());
          }
          const updated = { ...token, lastUsedAt: usedAt };
          tokens[index] = updated;
          return Effect.succeed(Option.some(updated));
        },
        revoke: ({ id, revokedAt, userId }) => {
          const index = tokens.findIndex(
            (token) => token.id === id && token.userId === userId
          );
          const token = tokens[index];
          if (token === undefined) {
            return Effect.succeed(Option.none());
          }
          const updated = { ...token, revokedAt };
          tokens[index] = updated;
          return Effect.succeed(Option.some(updated));
        },
      })
    );

  static readonly Default = Layer.effect(
    ApiTokenRepository,
    Effect.gen(function* () {
      const db = yield* Database;

      const create: ApiTokenRepositoryShape["create"] = Effect.fn(
        "ApiTokenRepository.create"
      )(function* create(input) {
        const { allowedGiidsJson, scopesJson } =
          yield* encodeApiTokenJsonFields({
            allowedGiids: input.allowedGiids,
            scopes: input.scopes,
          }).pipe(Effect.mapError((cause) => new RepositoryError({ cause })));
        const rows = yield* db
          .insert(apiToken)
          .values({
            allowedGiidsJson,
            createdAt: input.now,
            credentialId: input.credentialId,
            displayPrefix: input.displayPrefix,
            expiresAt: input.expiresAt ?? null,
            id: input.id,
            lastUsedAt: null,
            revokedAt: null,
            scopesJson,
            tokenHash: input.tokenHash,
            updatedAt: input.now,
            userId: input.userId,
          })
          .returning()
          .pipe(Effect.mapError((cause) => new RepositoryError({ cause })));
        const [row] = rows;
        return yield* row === undefined
          ? new RepositoryError({ cause: "API token insert returned no row" })
          : decodeApiTokenRow(row).pipe(
              Effect.mapError((cause) => new RepositoryError({ cause }))
            );
      });

      const getById: ApiTokenRepositoryShape["getById"] = Effect.fn(
        "ApiTokenRepository.getById"
      )((id) =>
        db.query.apiToken.findFirst({ where: { id } }).pipe(
          Effect.mapError((cause) => new RepositoryError({ cause })),
          Effect.map(Option.fromNullishOr),
          Effect.flatMap(decodeApiTokenOption)
        )
      );

      const findUsableByHash: ApiTokenRepositoryShape["findUsableByHash"] =
        Effect.fn("ApiTokenRepository.findUsableByHash")((input) =>
          db.query.apiToken
            .findFirst({
              where: {
                OR: [
                  { expiresAt: { isNull: true } },
                  { expiresAt: { gt: input.now } },
                ],
                revokedAt: { isNull: true },
                tokenHash: input.tokenHash,
              },
            })
            .pipe(
              Effect.mapError((cause) => new RepositoryError({ cause })),
              Effect.map(Option.fromNullishOr),
              Effect.flatMap(decodeApiTokenOption)
            )
        );

      const listForUser: ApiTokenRepositoryShape["listForUser"] = Effect.fn(
        "ApiTokenRepository.listForUser"
      )((userId) =>
        db.query.apiToken
          .findMany({
            orderBy: { createdAt: "desc" },
            where: { userId },
          })
          .pipe(
            Effect.mapError((cause) => new RepositoryError({ cause })),
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) =>
                decodeApiTokenRow(row).pipe(
                  Effect.mapError((cause) => new RepositoryError({ cause }))
                )
              )
            )
          )
      );

      const listForCredential: ApiTokenRepositoryShape["listForCredential"] =
        Effect.fn("ApiTokenRepository.listForCredential")((input) =>
          db.query.apiToken
            .findMany({
              orderBy: { createdAt: "desc" },
              where: { credentialId: input.credentialId, userId: input.userId },
            })
            .pipe(
              Effect.mapError((cause) => new RepositoryError({ cause })),
              Effect.flatMap((rows) =>
                Effect.forEach(rows, (row) =>
                  decodeApiTokenRow(row).pipe(
                    Effect.mapError((cause) => new RepositoryError({ cause }))
                  )
                )
              )
            )
        );

      const markUsed: ApiTokenRepositoryShape["markUsed"] = Effect.fn(
        "ApiTokenRepository.markUsed"
      )(function* markUsed(input) {
        const rows = yield* db
          .update(apiToken)
          .set({ lastUsedAt: input.usedAt, updatedAt: input.usedAt })
          .where(eq(apiToken.id, input.id))
          .returning()
          .pipe(Effect.mapError((cause) => new RepositoryError({ cause })));
        return yield* decodeApiTokenOption(Option.fromNullishOr(rows[0]));
      });

      const revoke: ApiTokenRepositoryShape["revoke"] = Effect.fn(
        "ApiTokenRepository.revoke"
      )(function* revoke(input) {
        const rows = yield* db
          .update(apiToken)
          .set({ revokedAt: input.revokedAt, updatedAt: input.revokedAt })
          .where(
            and(eq(apiToken.id, input.id), eq(apiToken.userId, input.userId))
          )
          .returning()
          .pipe(Effect.mapError((cause) => new RepositoryError({ cause })));
        return yield* decodeApiTokenOption(Option.fromNullishOr(rows[0]));
      });

      return ApiTokenRepository.of({
        create,
        findUsableByHash,
        getById,
        listForCredential,
        listForUser,
        markUsed,
        revoke,
      });
    })
  );
}

const decodeApiTokenOption = (option: Option.Option<ApiTokenRow>) =>
  Option.match(option, {
    onNone: () => Effect.succeed(Option.none<ApiTokenRecord>()),
    onSome: (row) =>
      decodeApiTokenRow(row).pipe(
        Effect.mapError((cause) => new RepositoryError({ cause })),
        Effect.map(Option.some)
      ),
  });
