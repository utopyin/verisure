import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { CredentialNotFound, ServiceUnavailable } from "./errors";
import {
  CredentialIdPayload,
  CredentialSummary,
  InstallationSummary,
} from "./shared";

export const InstallationRpcs = RpcGroup.make(
  Rpc.make("ListInstallations", {
    error: ServiceUnavailable,
    payload: CredentialIdPayload,
    success: Schema.Array(InstallationSummary),
  }),
  Rpc.make("SetDefaultInstallation", {
    error: Schema.Union([CredentialNotFound, ServiceUnavailable]),
    payload: Schema.Struct({
      credentialId: Schema.String,
      giid: Schema.String,
    }),
    success: CredentialSummary,
  })
).prefix("Installation.");
