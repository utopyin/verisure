import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import type { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

export class AuthMiddleware extends RpcMiddleware.Service<
  AuthMiddleware,
  { readonly provides: Server.CurrentUser }
>()("@verisure/api/AuthMiddleware", {
  error: RpcContract.Unauthorized,
  requiredForClient: true,
}) {}

export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const auth = yield* Server.BetterAuthService;
    const runtimeContext = yield* Effect.context<RuntimeContext>();

    return AuthMiddleware.of((effect, options) =>
      Effect.gen(function* () {
        const session = yield* auth
          .getSession(new Headers(options.headers))
          .pipe(
            Effect.provide(runtimeContext),
            Effect.mapError(
              () => new RpcContract.Unauthorized({ message: "Unauthorized" })
            )
          );

        if (Option.isNone(session)) {
          return yield* new RpcContract.Unauthorized({
            message: "Unauthorized",
          });
        }

        return yield* Effect.provideService(effect, Server.CurrentUser, {
          email: session.value.user.email,
          id: session.value.user.id,
          ...(session.value.user.name === undefined
            ? {}
            : { name: session.value.user.name }),
        });
      })
    );
  })
);
