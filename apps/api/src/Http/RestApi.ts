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
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpApiSchemaError } from "effect/unstable/httpapi/HttpApiError";

import { ShortcutApi } from "./ShortcutApi";
import {
  invalidInput,
  notFound,
  serviceUnavailable,
  toShortcutHttpServerResponse,
} from "./ShortcutErrors";
import { ShortcutApiHandlers } from "./ShortcutHandlers";

export const ShortcutRestMount = "/api/v1/*" as const;

export const ShortcutRestRoutes = HttpApiBuilder.layer(ShortcutApi, {
  openapiPath: "/api/v1/openapi.json",
}).pipe(Layer.provide(ShortcutApiHandlers));

const ShortcutRestLive = ShortcutRestRoutes.pipe(
  Layer.provideMerge(HttpRouter.layer),
  Layer.provideMerge(HttpServer.layerServices)
);

export const ShortcutRestHttp = HttpRouter.HttpRouter.pipe(
  Effect.map((router) =>
    router.asHttpEffect().pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) =>
          toShortcutHttpServerResponse(shortcutCauseToHttpError(cause)),
        onSuccess: (response) =>
          response.status === 415
            ? toShortcutHttpServerResponse(
                invalidInput("Unsupported content type")
              )
            : Effect.succeed(response),
      })
    )
  ),
  Effect.provide(ShortcutRestLive)
);

const shortcutCauseToHttpError = (
  cause: Cause.Cause<unknown>
): Parameters<typeof toShortcutHttpServerResponse>[0] => {
  const defect = Result.getOrUndefined(Cause.findDefect(cause));
  if (HttpApiSchemaError.is(defect) || defect instanceof SyntaxError) {
    return invalidInput("Invalid request payload");
  }

  const failure = Result.getOrUndefined(Cause.findFail(cause))?.error;
  if (
    failure instanceof HttpServerError &&
    failure.reason instanceof RouteNotFound
  ) {
    return notFound();
  }

  return serviceUnavailable();
};
