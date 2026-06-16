import { Database } from "@verisure/db";
import { verisureCredential } from "@verisure/db/schema";
import type { VerisureCredentialRow } from "@verisure/db/schema";
import type { ConnectionStatus } from "@verisure/domain";
import { decodeVerisureCredentialRow } from "@verisure/interface";
import { and, eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { RepositoryError } from "./RepositoryError.ts";

export interface CreateCredentialInput {
  readonly id: string;
  readonly userId: string;
  readonly alias: string;
  readonly encryptedEmail: string;
  readonly encryptedPassword: string;
  readonly encryptedPin?: string | null;
  readonly connectionStatus?: ConnectionStatus;
  readonly connectionStatusMessage?: string | null;
  readonly defaultGiid?: string | null;
  readonly now: Date;
}

export interface UpdateCredentialInput {
  readonly alias?: string;
  readonly encryptedEmail?: string;
  readonly encryptedPassword?: string;
  readonly encryptedPin?: string | null;
  readonly connectionStatus?: ConnectionStatus;
  readonly connectionStatusMessage?: string | null;
  readonly defaultGiid?: string | null;
  readonly lastConnectionAttemptAt?: Date | null;
  readonly connectedAt?: Date | null;
  readonly mfaRequestedAt?: Date | null;
  readonly now: Date;
}

export interface CredentialRepositoryShape {
  readonly create: (
    input: CreateCredentialInput
  ) => Effect.Effect<VerisureCredentialRow, RepositoryError>;
  readonly getById: (
    id: string
  ) => Effect.Effect<Option.Option<VerisureCredentialRow>, RepositoryError>;
  readonly getOwnedById: (input: {
    readonly id: string;
    readonly userId: string;
  }) => Effect.Effect<Option.Option<VerisureCredentialRow>, RepositoryError>;
  readonly listForUser: (
    userId: string
  ) => Effect.Effect<readonly VerisureCredentialRow[], RepositoryError>;
  readonly update: (input: {
    readonly id: string;
    readonly userId: string;
    readonly patch: UpdateCredentialInput;
  }) => Effect.Effect<Option.Option<VerisureCredentialRow>, RepositoryError>;
  readonly delete: (input: {
    readonly id: string;
    readonly userId: string;
  }) => Effect.Effect<void, RepositoryError>;
  readonly setDefaultInstallation: (input: {
    readonly id: string;
    readonly userId: string;
    readonly giid: string | null;
    readonly now: Date;
  }) => Effect.Effect<Option.Option<VerisureCredentialRow>, RepositoryError>;
  readonly setConnectionStatus: (input: {
    readonly id: string;
    readonly userId: string;
    readonly status: ConnectionStatus;
    readonly message?: string | null;
    readonly attemptedAt?: Date | null;
    readonly connectedAt?: Date | null;
    readonly mfaRequestedAt?: Date | null;
    readonly now: Date;
  }) => Effect.Effect<Option.Option<VerisureCredentialRow>, RepositoryError>;
}

export class CredentialRepository extends Context.Service<
  CredentialRepository,
  CredentialRepositoryShape
>()("@verisure/server/CredentialRepository") {
  static readonly Default = Layer.effect(
    CredentialRepository,
    Effect.gen(function* makeCredentialRepository() {
      const db = yield* Database;

      const create: CredentialRepositoryShape["create"] = Effect.fn(
        "CredentialRepository.create"
      )(function* create(input) {
        const rows = yield* db
          .insert(verisureCredential)
          .values({
            alias: input.alias,
            connectedAt: null,
            connectionStatus: input.connectionStatus ?? "unchecked",
            connectionStatusMessage: input.connectionStatusMessage ?? null,
            createdAt: input.now,
            defaultGiid: input.defaultGiid ?? null,
            encryptedEmail: input.encryptedEmail,
            encryptedPassword: input.encryptedPassword,
            encryptedPin: input.encryptedPin ?? null,
            id: input.id,
            lastConnectionAttemptAt: null,
            mfaRequestedAt: null,
            updatedAt: input.now,
            userId: input.userId,
          })
          .returning()
          .pipe(Effect.mapError((cause) => new RepositoryError({ cause })));
        const [row] = rows;
        return yield* row === undefined
          ? new RepositoryError({ cause: "Credential insert returned no row" })
          : decodeVerisureCredentialRow(row).pipe(
              Effect.mapError((cause) => new RepositoryError({ cause }))
            );
      });

      const getById: CredentialRepositoryShape["getById"] = Effect.fn(
        "CredentialRepository.getById"
      )((id) =>
        db.query.verisureCredential.findFirst({ where: { id } }).pipe(
          Effect.mapError((cause) => new RepositoryError({ cause })),
          Effect.map(Option.fromNullishOr),
          Effect.flatMap(decodeCredentialOption)
        )
      );

      const getOwnedById: CredentialRepositoryShape["getOwnedById"] = Effect.fn(
        "CredentialRepository.getOwnedById"
      )((input) =>
        db.query.verisureCredential
          .findFirst({ where: { id: input.id, userId: input.userId } })
          .pipe(
            Effect.mapError((cause) => new RepositoryError({ cause })),
            Effect.map(Option.fromNullishOr),
            Effect.flatMap(decodeCredentialOption)
          )
      );

      const listForUser: CredentialRepositoryShape["listForUser"] = Effect.fn(
        "CredentialRepository.listForUser"
      )((userId) =>
        db.query.verisureCredential
          .findMany({
            orderBy: { createdAt: "desc" },
            where: { userId },
          })
          .pipe(
            Effect.mapError((cause) => new RepositoryError({ cause })),
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) =>
                decodeVerisureCredentialRow(row).pipe(
                  Effect.mapError((cause) => new RepositoryError({ cause }))
                )
              )
            )
          )
      );

      const update: CredentialRepositoryShape["update"] = Effect.fn(
        "CredentialRepository.update"
      )(function* update(input) {
        const rows = yield* db
          .update(verisureCredential)
          .set(toCredentialPatch(input.patch))
          .where(
            and(
              eq(verisureCredential.id, input.id),
              eq(verisureCredential.userId, input.userId)
            )
          )
          .returning()
          .pipe(Effect.mapError((cause) => new RepositoryError({ cause })));
        return yield* decodeCredentialOption(Option.fromNullishOr(rows[0]));
      });

      const deleteCredential: CredentialRepositoryShape["delete"] = Effect.fn(
        "CredentialRepository.delete"
      )((input) =>
        db
          .delete(verisureCredential)
          .where(
            and(
              eq(verisureCredential.id, input.id),
              eq(verisureCredential.userId, input.userId)
            )
          )
          .pipe(
            Effect.asVoid,
            Effect.mapError((cause) => new RepositoryError({ cause }))
          )
      );

      const setDefaultInstallation: CredentialRepositoryShape["setDefaultInstallation"] =
        Effect.fn("CredentialRepository.setDefaultInstallation")((input) =>
          update({
            id: input.id,
            patch: { defaultGiid: input.giid, now: input.now },
            userId: input.userId,
          })
        );

      const setConnectionStatus: CredentialRepositoryShape["setConnectionStatus"] =
        Effect.fn("CredentialRepository.setConnectionStatus")((input) =>
          update({
            id: input.id,
            patch: {
              connectedAt: input.connectedAt ?? null,
              connectionStatus: input.status,
              connectionStatusMessage: input.message ?? null,
              lastConnectionAttemptAt: input.attemptedAt ?? null,
              mfaRequestedAt: input.mfaRequestedAt ?? null,
              now: input.now,
            },
            userId: input.userId,
          })
        );

      return CredentialRepository.of({
        create,
        delete: deleteCredential,
        getById,
        getOwnedById,
        listForUser,
        setConnectionStatus,
        setDefaultInstallation,
        update,
      });
    })
  );
}

const decodeCredentialOption = (option: Option.Option<VerisureCredentialRow>) =>
  Option.match(option, {
    onNone: () => Effect.succeed(Option.none<VerisureCredentialRow>()),
    onSome: (row) =>
      decodeVerisureCredentialRow(row).pipe(
        Effect.mapError((cause) => new RepositoryError({ cause })),
        Effect.map(Option.some)
      ),
  });

const toCredentialPatch = (input: UpdateCredentialInput) => ({
  ...(input.alias === undefined ? {} : { alias: input.alias }),
  ...(input.encryptedEmail === undefined
    ? {}
    : { encryptedEmail: input.encryptedEmail }),
  ...(input.encryptedPassword === undefined
    ? {}
    : { encryptedPassword: input.encryptedPassword }),
  ...(input.encryptedPin === undefined
    ? {}
    : { encryptedPin: input.encryptedPin }),
  ...(input.connectionStatus === undefined
    ? {}
    : { connectionStatus: input.connectionStatus }),
  ...(input.connectionStatusMessage === undefined
    ? {}
    : { connectionStatusMessage: input.connectionStatusMessage }),
  ...(input.defaultGiid === undefined
    ? {}
    : { defaultGiid: input.defaultGiid }),
  ...(input.lastConnectionAttemptAt === undefined
    ? {}
    : { lastConnectionAttemptAt: input.lastConnectionAttemptAt }),
  ...(input.connectedAt === undefined
    ? {}
    : { connectedAt: input.connectedAt }),
  ...(input.mfaRequestedAt === undefined
    ? {}
    : { mfaRequestedAt: input.mfaRequestedAt }),
  updatedAt: input.now,
});
