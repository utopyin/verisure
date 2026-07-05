import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { DashboardRpcError } from "../errors";
import {
  CredentialIdPayload,
  CredentialSummary,
  InstallationSummary,
} from "./shared";

export const CredentialRpcs = RpcGroup.make(
  Rpc.make("ListCredentials", {
    error: DashboardRpcError,
    success: Schema.Array(CredentialSummary),
  }),
  Rpc.make("CreateCredential", {
    error: DashboardRpcError,
    payload: Schema.Struct({
      alias: Schema.String,
      email: Schema.String,
      password: Schema.String,
      pin: Schema.optionalKey(Schema.String),
    }),
    success: CredentialSummary,
  }),
  Rpc.make("DeleteCredential", {
    error: DashboardRpcError,
    payload: CredentialIdPayload,
  }),
  Rpc.make("RequestCredentialMfa", {
    error: DashboardRpcError,
    payload: CredentialIdPayload,
    success: Schema.Struct({
      credentialId: Schema.String,
      deliveryHint: Schema.optionalKey(Schema.String),
      status: Schema.Literal("mfa_requested"),
    }),
  }),
  Rpc.make("ValidateCredentialMfa", {
    error: DashboardRpcError,
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
