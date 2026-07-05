import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import { AuthMiddleware } from "./AuthMiddleware";
import { toDashboardRpcError } from "./ErrorMapper";

export const Rpcs = RpcContract.ShortcutRpcs.middleware(AuthMiddleware);

export const shortcutHandlers = Effect.gen(function* () {
  const shortcuts = yield* Server.ShortcutExportService;
  const tokens = yield* Server.ApiTokenService;

  return Rpcs.of({
    "Shortcut.ExportShortcut": (payload) =>
      shortcuts
        .exportShortcut(payload)
        .pipe(
          Effect.mapError(toDashboardRpcError),
          Effect.flatMap(decodeShortcutExportPayload)
        ),
    "Shortcut.ListApiTokens": (payload) =>
      tokens
        .list(payload)
        .pipe(
          Effect.mapError(toDashboardRpcError),
          Effect.flatMap(decodeShortcutApiTokenSummaries)
        ),
    "Shortcut.RevokeApiToken": (payload) =>
      tokens.revoke(payload).pipe(Effect.mapError(toDashboardRpcError)),
  });
});

const ShortcutExportResultForRpc = Schema.Struct({
  apiToken: Schema.Unknown,
  apiUrl: Schema.String,
  bearerToken: Schema.String,
  credentialId: Schema.String,
  downloadUrl: Schema.optionalKey(Schema.String),
  giid: Schema.optionalKey(Schema.String),
  instructions: Schema.Array(Schema.String),
  shortcutName: Schema.String,
  template: Schema.Literals(["toggle-full", "choose-mode"]),
}).pipe(
  Schema.decodeTo(RpcContract.ShortcutExportPayload, {
    decode: SchemaGetter.transform(({ apiToken: _, ...payload }) => payload),
    encode: SchemaGetter.forbidden(
      () => "Encoding shortcut export RPC payloads is unsupported"
    ),
  })
);

const ApiTokenRecordForRpc = Schema.Struct({
  allowedGiids: Schema.optionalKey(Schema.Array(Schema.String)),
  createdAt: Schema.Date,
  credentialId: Schema.String,
  displayPrefix: Schema.String,
  expiresAt: Schema.NullOr(Schema.Date),
  id: Schema.String,
  lastUsedAt: Schema.NullOr(Schema.Date),
  revokedAt: Schema.NullOr(Schema.Date),
  scopes: Schema.Array(Schema.String),
  tokenHash: Schema.String,
  updatedAt: Schema.Date,
  userId: Schema.String,
}).pipe(
  Schema.decodeTo(RpcContract.ShortcutApiTokenSummary, {
    decode: SchemaGetter.transform((apiToken) => ({
      ...optionalField("allowedGiids", apiToken.allowedGiids),
      createdAt: apiToken.createdAt.toISOString(),
      credentialId: apiToken.credentialId,
      displayPrefix: apiToken.displayPrefix,
      ...optionalDateField("expiresAt", apiToken.expiresAt),
      id: apiToken.id,
      ...optionalDateField("lastUsedAt", apiToken.lastUsedAt),
      ...optionalDateField("revokedAt", apiToken.revokedAt),
      scopes: apiToken.scopes,
    })),
    encode: SchemaGetter.forbidden(
      () => "Encoding API token records from RPC summaries is unsupported"
    ),
  })
);

const decodeShortcutExportPayload = (payload: unknown) =>
  Schema.decodeUnknownEffect(ShortcutExportResultForRpc)(payload).pipe(
    Effect.mapError(
      (cause) =>
        new RpcContract.InvalidInput({
          message: `Invalid shortcut export payload: ${cause.message}`,
        })
    )
  );

const decodeShortcutApiTokenSummaries = (payload: unknown) =>
  Schema.decodeUnknownEffect(Schema.Array(ApiTokenRecordForRpc))(payload).pipe(
    Effect.mapError(
      (cause) =>
        new RpcContract.InvalidInput({
          message: `Invalid API token summary payload: ${cause.message}`,
        })
    )
  );

const optionalDateField = <Key extends string>(key: Key, value: Date | null) =>
  value === null ? {} : { [key]: value.toISOString() };

const optionalField = <Key extends string, Value>(
  key: Key,
  value: Value | undefined
) => (value === undefined ? {} : { [key]: value });
