import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AuthMiddleware } from "./AuthMiddleware";

export const Rpcs = RpcContract.AuthRpcs.middleware(AuthMiddleware);

export const authHandlers = Effect.gen(function* () {
  const auth = yield* Server.BetterAuthService;

  return Rpcs.of({
    "Auth.GetSession": (_payload, options) =>
      Effect.gen(function* () {
        const session = yield* auth
          .getSession(new Headers(options.headers))
          .pipe(
            Effect.mapError(
              () => new RpcContract.Unauthorized({ message: "Unauthorized" })
            )
          );
        if (Option.isNone(session)) {
          return yield* new RpcContract.Unauthorized({
            message: "Unauthorized",
          });
        }
        return {
          expiresAt: session.value.expiresAt.toISOString(),
          user: session.value.user,
        };
      }),
    "Auth.Logout": () =>
      Effect.fail(
        new RpcContract.InvalidInput({
          message: "Dashboard logout is not implemented yet",
        })
      ),
  });
});
