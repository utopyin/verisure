import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";

import { toDashboardRpcError } from "../Http/ErrorMapper";
import { AuthMiddleware } from "./AuthMiddleware";
import { CredentialScopeMiddleware } from "./ScopeMiddleware";

export const Rpcs = RpcContract.CredentialRpcs.omit(
  "Credential.DeleteCredential",
  "Credential.RequestCredentialMfa",
  "Credential.ValidateCredentialMfa"
)
  .middleware(AuthMiddleware)
  .merge(
    RpcContract.CredentialRpcs.omit(
      "Credential.ListCredentials",
      "Credential.CreateCredential"
    )
      .middleware(CredentialScopeMiddleware)
      .middleware(AuthMiddleware)
  );

export const credentialHandlers = Effect.gen(function* () {
  const credential = yield* Server.CredentialService;

  return Rpcs.of({
    "Credential.CreateCredential": (payload) =>
      credential.create(payload).pipe(Effect.mapError(toDashboardRpcError)),
    "Credential.DeleteCredential": () =>
      credential.delete.pipe(Effect.mapError(toDashboardRpcError)),
    "Credential.ListCredentials": () =>
      credential.list.pipe(Effect.mapError(toDashboardRpcError)),
    "Credential.RequestCredentialMfa": () =>
      credential.requestMfa.pipe(Effect.mapError(toDashboardRpcError)),
    "Credential.ValidateCredentialMfa": (payload) =>
      credential
        .validateMfa(payload.code)
        .pipe(Effect.mapError(toDashboardRpcError)),
  });
});
