import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";

import { toDashboardRpcError } from "../Http/ErrorMapper";
import { AuthMiddleware } from "./AuthMiddleware";
import { CredentialScopeMiddleware } from "./ScopeMiddleware";

export const Rpcs = RpcContract.InstallationRpcs.middleware(
  CredentialScopeMiddleware
).middleware(AuthMiddleware);

export const installationHandlers = Effect.gen(function* () {
  const installation = yield* Server.InstallationService;

  return Rpcs.of({
    "Installation.ListInstallations": () =>
      installation.list.pipe(Effect.mapError(toDashboardRpcError)),
    "Installation.SetDefaultInstallation": (payload) =>
      installation
        .setDefault(payload.giid)
        .pipe(Effect.mapError(toDashboardRpcError)),
  });
});
