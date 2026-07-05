import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
  ApiTokenNotFound,
  CredentialNotFound,
  ServiceUnavailable,
} from "../errors";

const ShortcutTemplate = Schema.Literals(["toggle-full", "choose-mode"]);

export const ShortcutExportPayload = Schema.Struct({
  apiUrl: Schema.String,
  bearerToken: Schema.String,
  credentialId: Schema.String,
  downloadUrl: Schema.optionalKey(Schema.String),
  giid: Schema.optionalKey(Schema.String),
  instructions: Schema.Array(Schema.String),
  shortcutName: Schema.String,
  template: ShortcutTemplate,
});

export const ShortcutApiTokenSummary = Schema.Struct({
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

export const ShortcutRpcs = RpcGroup.make(
  Rpc.make("ExportShortcut", {
    error: Schema.Union([CredentialNotFound, ServiceUnavailable]),
    payload: Schema.Struct({
      credentialId: Schema.String,
      giid: Schema.optionalKey(Schema.String),
      template: ShortcutTemplate,
    }),
    success: ShortcutExportPayload,
  }),
  Rpc.make("ListApiTokens", {
    error: ServiceUnavailable,
    payload: Schema.Struct({
      credentialId: Schema.optionalKey(Schema.String),
    }),
    success: Schema.Array(ShortcutApiTokenSummary),
  }),
  Rpc.make("RevokeApiToken", {
    error: Schema.Union([ApiTokenNotFound, ServiceUnavailable]),
    payload: Schema.Struct({
      tokenId: Schema.String,
    }),
  })
).prefix("Shortcut.");
