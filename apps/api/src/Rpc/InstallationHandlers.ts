import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";

import { AuthMiddleware } from "./AuthMiddleware";
import { CredentialScopeMiddleware } from "./ScopeMiddleware";

export const Rpcs = RpcContract.InstallationRpcs.middleware(
  CredentialScopeMiddleware
).middleware(AuthMiddleware);

export const installationHandlers = Effect.gen(function* () {
  const installation = yield* Server.InstallationService;

  return Rpcs.of({
    "Installation.ListInstallations": () =>
      installation.list.pipe(
        Effect.catchTag("ServiceUnavailable", (error) =>
          Effect.fail(
            new RpcContract.ServiceUnavailable({ message: error.message })
          )
        )
      ),
    "Installation.SetDefaultInstallation": (payload) =>
      installation.setDefault(payload.giid).pipe(
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
              new RpcContract.ServiceUnavailable({
                message: error.message,
              })
            ),
        })
      ),
  });
});
