import { Database } from "@verisure/db";
import { shortcutExport } from "@verisure/db/schema";
import type { ShortcutExportRow } from "@verisure/db/schema";
import type { ShortcutTemplate } from "@verisure/domain";
import { decodeShortcutExportRow } from "@verisure/interface";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { RepositoryError } from "./RepositoryError.ts";

export interface CreateShortcutExportInput {
  readonly id: string;
  readonly userId: string;
  readonly credentialId: string;
  readonly apiTokenId: string;
  readonly template: ShortcutTemplate;
  readonly downloadNonceHash?: string | null;
  readonly now: Date;
}

export interface ShortcutExportRepositoryShape {
  readonly create: (
    input: CreateShortcutExportInput
  ) => Effect.Effect<ShortcutExportRow, RepositoryError>;
  readonly getById: (
    id: string
  ) => Effect.Effect<Option.Option<ShortcutExportRow>, RepositoryError>;
  readonly listForUser: (
    userId: string
  ) => Effect.Effect<readonly ShortcutExportRow[], RepositoryError>;
  readonly listForCredential: (input: {
    readonly userId: string;
    readonly credentialId: string;
  }) => Effect.Effect<readonly ShortcutExportRow[], RepositoryError>;
}

export class ShortcutExportRepository extends Context.Service<
  ShortcutExportRepository,
  ShortcutExportRepositoryShape
>()("@verisure/server/ShortcutExportRepository") {
  static readonly Default = Layer.effect(
    ShortcutExportRepository,
    Effect.gen(function* makeShortcutExportRepository() {
      const db = yield* Database;

      const create: ShortcutExportRepositoryShape["create"] = Effect.fn(
        "ShortcutExportRepository.create"
      )(function* create(input) {
        const rows = yield* db
          .insert(shortcutExport)
          .values({
            apiTokenId: input.apiTokenId,
            createdAt: input.now,
            credentialId: input.credentialId,
            downloadNonceHash: input.downloadNonceHash ?? null,
            id: input.id,
            template: input.template,
            userId: input.userId,
          })
          .returning()
          .pipe(Effect.mapError((cause) => new RepositoryError({ cause })));
        const [row] = rows;
        return yield* row === undefined
          ? new RepositoryError({
              cause: "Shortcut export insert returned no row",
            })
          : decodeShortcutExportRow(row).pipe(
              Effect.mapError((cause) => new RepositoryError({ cause }))
            );
      });

      const getById: ShortcutExportRepositoryShape["getById"] = Effect.fn(
        "ShortcutExportRepository.getById"
      )((id) =>
        db.query.shortcutExport.findFirst({ where: { id } }).pipe(
          Effect.mapError((cause) => new RepositoryError({ cause })),
          Effect.map(Option.fromNullishOr),
          Effect.flatMap(decodeShortcutExportOption)
        )
      );

      const listForUser: ShortcutExportRepositoryShape["listForUser"] =
        Effect.fn("ShortcutExportRepository.listForUser")((userId) =>
          db.query.shortcutExport
            .findMany({
              orderBy: { createdAt: "desc" },
              where: { userId },
            })
            .pipe(
              Effect.mapError((cause) => new RepositoryError({ cause })),
              Effect.flatMap((rows) =>
                Effect.forEach(rows, (row) =>
                  decodeShortcutExportRow(row).pipe(
                    Effect.mapError((cause) => new RepositoryError({ cause }))
                  )
                )
              )
            )
        );

      const listForCredential: ShortcutExportRepositoryShape["listForCredential"] =
        Effect.fn("ShortcutExportRepository.listForCredential")((input) =>
          db.query.shortcutExport
            .findMany({
              orderBy: { createdAt: "desc" },
              where: { credentialId: input.credentialId, userId: input.userId },
            })
            .pipe(
              Effect.mapError((cause) => new RepositoryError({ cause })),
              Effect.flatMap((rows) =>
                Effect.forEach(rows, (row) =>
                  decodeShortcutExportRow(row).pipe(
                    Effect.mapError((cause) => new RepositoryError({ cause }))
                  )
                )
              )
            )
        );

      return ShortcutExportRepository.of({
        create,
        getById,
        listForCredential,
        listForUser,
      });
    })
  );
}

const decodeShortcutExportOption = (option: Option.Option<ShortcutExportRow>) =>
  Option.match(option, {
    onNone: () => Effect.succeed(Option.none<ShortcutExportRow>()),
    onSome: (row) =>
      decodeShortcutExportRow(row).pipe(
        Effect.mapError((cause) => new RepositoryError({ cause })),
        Effect.map(Option.some)
      ),
  });
