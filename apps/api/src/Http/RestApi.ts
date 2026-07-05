import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import * as HttpServerError from "effect/unstable/http/HttpServerError";
import { HttpApiBuilder } from "effect/unstable/httpapi";

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
    router
      .asHttpEffect()
      .pipe(
        Effect.catchCause((cause) =>
          HttpServerError.causeResponse(cause).pipe(
            Effect.map(([response]) => response)
          )
        )
      )
  ),
  Effect.provide(ShortcutRestLive)
);
