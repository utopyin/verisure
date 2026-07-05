import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
  CredentialNotFound,
  InstallationUnavailable,
  InvalidInput,
  Unauthorized,
} from "../errors";
import {
  CredentialIdPayload,
  CredentialSummary,
  InstallationSummary,
} from "./shared";

const InstallationRpcError = Schema.Union([
  Unauthorized,
  CredentialNotFound,
  InvalidInput,
  InstallationUnavailable,
]);

export const InstallationRpcs = RpcGroup.make(
  Rpc.make("ListInstallations", {
    error: InstallationRpcError,
    payload: CredentialIdPayload,
    success: Schema.Array(InstallationSummary),
  }),
  Rpc.make("SetDefaultInstallation", {
    error: InstallationRpcError,
    payload: Schema.Struct({
      credentialId: Schema.String,
      giid: Schema.String,
    }),
    success: CredentialSummary,
  })
).prefix("Installation.");
