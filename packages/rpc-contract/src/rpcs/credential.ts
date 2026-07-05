import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
  CredentialNotFound,
  CredentialUnavailable,
  InvalidInput,
  Unauthorized,
} from "../errors";
import {
  CredentialIdPayload,
  CredentialSummary,
  InstallationSummary,
} from "./shared";

const CredentialRpcError = Schema.Union([
  Unauthorized,
  CredentialNotFound,
  InvalidInput,
  CredentialUnavailable,
]);

export const CredentialRpcs = RpcGroup.make(
  Rpc.make("ListCredentials", {
    error: Schema.Union([Unauthorized, CredentialUnavailable]),
    success: Schema.Array(CredentialSummary),
  }),
  Rpc.make("CreateCredential", {
    error: Schema.Union([Unauthorized, CredentialUnavailable]),
    payload: Schema.Struct({
      alias: Schema.String,
      email: Schema.String,
      password: Schema.String,
      pin: Schema.optionalKey(Schema.String),
    }),
    success: CredentialSummary,
  }),
  Rpc.make("DeleteCredential", {
    error: CredentialRpcError,
    payload: CredentialIdPayload,
  }),
  Rpc.make("RequestCredentialMfa", {
    error: CredentialRpcError,
    payload: CredentialIdPayload,
    success: Schema.Struct({
      credentialId: Schema.String,
      deliveryHint: Schema.optionalKey(Schema.String),
      status: Schema.Literal("mfa_requested"),
    }),
  }),
  Rpc.make("ValidateCredentialMfa", {
    error: CredentialRpcError,
    payload: Schema.Struct({
      code: Schema.String,
      credentialId: Schema.String,
    }),
    success: Schema.Struct({
      credential: CredentialSummary,
      installations: Schema.Array(InstallationSummary),
    }),
  })
).prefix("Credential.");
