import * as Server from "@verisure/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { Url } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { ApiMounts } from "./App";
import { ShortcutRestHttp } from "./RestApi";
import { DashboardRpcHttp } from "./RpcMount";

export interface ApiHttpAppShape {
  readonly fetch: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest
  >;
}

export class ApiHttpApp extends Context.Service<ApiHttpApp, ApiHttpAppShape>()(
  "@verisure/api/ApiHttpApp"
) {}

export const ApiHttpAppLive = Layer.effect(
  ApiHttpApp,
  Effect.gen(function* () {
    const auth = yield* Server.BetterAuthService;
    const dashboardRpcHttp = yield* DashboardRpcHttp;
    const shortcutRestHttp = yield* ShortcutRestHttp;

    const fetch = Effect.gen(function* () {
      const request = yield* HttpServerRequest;
      const urlResult = Url.fromString(request.url);

      if (Result.isFailure(urlResult)) {
        return yield* HttpServerResponse.json(
          { error: "Invalid URL" },
          { status: 400 }
        );
      }

      const { pathname } = urlResult.success;

      if (request.method === "GET" && pathname === ApiMounts.health) {
        return yield* HttpServerResponse.json({
          ok: true,
          service: "verisure-api",
        });
      }

      if (pathname.startsWith("/api/auth")) {
        return yield* auth.fetch.pipe(
          Effect.catchTags({
            AuthError: (error) =>
              HttpServerResponse.json(
                { error: error.message },
                { status: 400 }
              ),
          })
        );
      }

      if (pathname.startsWith("/api/rpc")) {
        return yield* dashboardRpcHttp;
      }

      if (pathname.startsWith("/api/v1/")) {
        return yield* shortcutRestHttp;
      }

      return yield* HttpServerResponse.json(
        { error: "Not Found" },
        { status: 404 }
      );
    }).pipe(Effect.withSpan("ApiHttpApp.fetch"));

    return ApiHttpApp.of({ fetch });
  })
);
