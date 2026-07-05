import * as Server from "@verisure/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { ShortcutRestHttp } from "./RestApi";
import { DashboardRpcHttp } from "./RpcMount";

interface ApiHttpAppShape {
  readonly fetch: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest
  >;
}

export class ApiHttpApp extends Context.Service<ApiHttpApp, ApiHttpAppShape>()(
  "@verisure/api/ApiHttpApp"
) {}

const ApiHttpRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const auth = yield* Server.BetterAuthService;
    const dashboardRpcHttp = yield* DashboardRpcHttp;
    const shortcutRestHttp = yield* ShortcutRestHttp;

    yield* router.add(
      "GET",
      "/api/health",
      HttpServerResponse.jsonUnsafe({ ok: true, service: "verisure-api" })
    );

    yield* router.add(
      "*",
      "/api/auth/*",
      auth.fetch.pipe(
        Effect.catchTags({
          AuthError: (error) =>
            Effect.succeed(
              HttpServerResponse.jsonUnsafe(
                { error: error.message },
                { status: 400 }
              )
            ),
        })
      )
    );

    yield* router.add("*", "/api/rpc/*", dashboardRpcHttp);
    yield* router.add("*", "/api/v1/*", shortcutRestHttp);
    yield* router.add(
      "*",
      "*",
      HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })
    );
  })
);

const ApiHttpRouterLive = ApiHttpRoutes.pipe(
  Layer.provideMerge(HttpRouter.layer)
);

export const ApiHttpAppLive = Layer.effect(
  ApiHttpApp,
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const fetch = router.asHttpEffect().pipe(
      Effect.orElseSucceed(() =>
        HttpServerResponse.jsonUnsafe(
          { error: "Service is unavailable" },
          { status: 503 }
        )
      ),
      Effect.scoped,
      Effect.withSpan("ApiHttpApp.fetch")
    );

    return ApiHttpApp.of({ fetch });
  })
).pipe(Layer.provide(ApiHttpRouterLive));
