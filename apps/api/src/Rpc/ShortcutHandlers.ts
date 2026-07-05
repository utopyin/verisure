import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { AuthMiddleware } from "./AuthMiddleware";

export const Rpcs = RpcContract.ShortcutRpcs.middleware(AuthMiddleware);

export const shortcutHandlers = Effect.gen(function* () {
  const shortcuts = yield* Server.ShortcutExportService;
  const tokens = yield* Server.ApiTokenService;

  return Rpcs.of({
    "Shortcut.ExportShortcut": (payload) =>
      shortcuts.exportShortcut(payload).pipe(
        Effect.catchTags({
          CredentialNotFound: (error) =>
            Effect.fail(
              new RpcContract.CredentialNotFound({
                credentialId: error.credentialId,
                message: error.message,
              })
            ),
          ServiceUnavailable: (error) =>
            Effect.fail(
              new RpcContract.ShortcutUnavailable({ message: error.message })
            ),
        }),
        Effect.flatMap((payload) =>
          decodeShortcutExportPayload(payload).pipe(
            Effect.mapError(
              () =>
                new RpcContract.ShortcutUnavailable({
                  message: "Invalid shortcut export",
                })
            )
          )
        )
      ),
    "Shortcut.ListApiTokens": (payload) =>
      tokens.list(payload).pipe(
        Effect.catchTag("ServiceUnavailable", (error) =>
          Effect.fail(
            new RpcContract.ShortcutUnavailable({ message: error.message })
          )
        ),
        Effect.flatMap((tokens) =>
          decodeShortcutApiTokenSummaries(
            tokens.map(toShortcutApiTokenSummary)
          ).pipe(
            Effect.mapError(
              () =>
                new RpcContract.ShortcutUnavailable({
                  message: "Invalid API token list",
                })
            )
          )
        )
      ),
    "Shortcut.RevokeApiToken": (payload) =>
      tokens.revoke(payload).pipe(
        Effect.catchTags({
          ApiTokenNotFound: (error) =>
            Effect.fail(
              new RpcContract.ApiTokenNotFound({ message: error.message })
            ),
          ServiceUnavailable: (error) =>
            Effect.fail(
              new RpcContract.ShortcutUnavailable({ message: error.message })
            ),
        })
      ),
  });
});

const ApiTokenSummaryForRpc = Schema.Struct({
  allowedGiids: Schema.optionalKey(Schema.Array(Schema.String)),
  createdAt: Schema.String,
  credentialId: Schema.String,
  displayPrefix: Schema.String,
  expiresAt: Schema.optionalKey(Schema.String),
  id: Schema.String,
  lastUsedAt: Schema.optionalKey(Schema.String),
  revokedAt: Schema.optionalKey(Schema.String),
  scopes: Schema.Array(Schema.String),
});

const ShortcutExportPayloadForRpc = Schema.Struct({
  apiUrl: Schema.String,
  bearerToken: Schema.String,
  credentialId: Schema.String,
  downloadUrl: Schema.optionalKey(Schema.String),
  giid: Schema.optionalKey(Schema.String),
  instructions: Schema.Array(Schema.String),
  shortcutName: Schema.String,
  template: Schema.Literals(["choose-mode", "toggle-full"]),
});

const ShortcutApiTokenSummariesForRpc = Schema.Array(ApiTokenSummaryForRpc);

const toShortcutApiTokenSummary = (token: {
  readonly allowedGiids?: readonly string[] | null;
  readonly createdAt: Date;
  readonly credentialId: string;
  readonly displayPrefix: string;
  readonly expiresAt?: Date | null;
  readonly id: string;
  readonly lastUsedAt?: Date | null;
  readonly revokedAt?: Date | null;
  readonly scopes: readonly string[];
}) => ({
  ...(token.allowedGiids === null || token.allowedGiids === undefined
    ? {}
    : { allowedGiids: [...token.allowedGiids] }),
  ...(token.expiresAt === null || token.expiresAt === undefined
    ? {}
    : { expiresAt: token.expiresAt.toISOString() }),
  ...(token.lastUsedAt === null || token.lastUsedAt === undefined
    ? {}
    : { lastUsedAt: token.lastUsedAt.toISOString() }),
  ...(token.revokedAt === null || token.revokedAt === undefined
    ? {}
    : { revokedAt: token.revokedAt.toISOString() }),
  createdAt: token.createdAt.toISOString(),
  credentialId: token.credentialId,
  displayPrefix: token.displayPrefix,
  id: token.id,
  scopes: [...token.scopes],
});

const decodeShortcutExportPayload = Schema.decodeUnknownEffect(
  ShortcutExportPayloadForRpc
);
const decodeShortcutApiTokenSummaries = Schema.decodeUnknownEffect(
  ShortcutApiTokenSummariesForRpc
);
