import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import {
  HttpServerError,
  RouteNotFound,
} from "effect/unstable/http/HttpServerError";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpApiSchemaError } from "effect/unstable/httpapi/HttpApiError";

import { ShortcutApi } from "./ShortcutApi";
import { ShortcutApiHandlers } from "./ShortcutHandlers";
import { ShortcutMiddlewareLive } from "./ShortcutMiddleware";

const ShortcutRestRoutes = HttpApiBuilder.layer(ShortcutApi, {
  openapiPath: "/api/v1/openapi.json",
}).pipe(
  Layer.provide(ShortcutApiHandlers),
  Layer.provide(ShortcutMiddlewareLive)
);

const ShortcutRestLive = ShortcutRestRoutes.pipe(
  Layer.provideMerge(HttpRouter.layer),
  Layer.provideMerge(HttpServer.layerServices)
);

export const ShortcutRestHttp = HttpRouter.HttpRouter.pipe(
  Effect.map((router) =>
    router.asHttpEffect().pipe(
      Effect.map((response) =>
        response.status === 415
          ? HttpServerResponse.jsonUnsafe(
              { message: "Unsupported content type" },
              { status: 400 }
            )
          : response
      ),
      Effect.catchCause((cause) => {
        const defect = Result.getOrUndefined(Cause.findDefect(cause));
        if (HttpApiSchemaError.is(defect) || defect instanceof SyntaxError) {
          return Effect.succeed(
            HttpServerResponse.jsonUnsafe(
              { message: "Invalid request payload" },
              { status: 400 }
            )
          );
        }

        const failure = Result.getOrUndefined(Cause.findFail(cause))?.error;
        if (
          failure instanceof HttpServerError &&
          failure.reason instanceof RouteNotFound
        ) {
          return Effect.succeed(
            HttpServerResponse.jsonUnsafe(
              { message: "Not Found" },
              { status: 404 }
            )
          );
        }

        return Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { message: "Service is unavailable" },
            { status: 503 }
          )
        );
      })
    )
  ),
  Effect.provide(ShortcutRestLive)
);
