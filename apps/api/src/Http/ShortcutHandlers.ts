import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";

import { ShortcutApi } from "./ShortcutApi";

export const ShortcutApiHandlers = HttpApiBuilder.group(
  ShortcutApi,
  "alarm",
  Effect.fn("ShortcutApi.handlers")(function* (handlers) {
    const alarm = yield* Server.AlarmService;

    return handlers
      .handle("status", () =>
        alarm.getArmState.pipe(
          Effect.catchTag("ServiceUnavailable", () =>
            Effect.fail(new HttpApiError.ServiceUnavailable())
          )
        )
      )
      .handle("toggleFull", ({ payload }) =>
        alarm.toggleFull(payload.code).pipe(
          Effect.catchTags({
            AlarmCodeRequired: () => Effect.fail(new HttpApiError.BadRequest()),
            ServiceUnavailable: () =>
              Effect.fail(new HttpApiError.ServiceUnavailable()),
          })
        )
      )
      .handle("setMode", ({ payload }) =>
        alarm.setMode({ code: payload.code, mode: payload.mode }).pipe(
          Effect.catchTags({
            AlarmCodeRequired: () => Effect.fail(new HttpApiError.BadRequest()),
            ServiceUnavailable: () =>
              Effect.fail(new HttpApiError.ServiceUnavailable()),
          })
        )
      );
  })
);
