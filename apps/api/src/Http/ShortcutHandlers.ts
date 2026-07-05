import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { ShortcutApi } from "./ShortcutApi";
import {
  ShortcutInvalidInputError,
  ShortcutServiceUnavailableError,
} from "./ShortcutErrors";
import { provideShortcutAlarmScope } from "./ShortcutMiddleware";

export const ShortcutApiHandlers = HttpApiBuilder.group(
  ShortcutApi,
  "alarm",
  Effect.fn("ShortcutApi.handlers")(function* (handlers) {
    const alarm = yield* Server.AlarmService;

    return handlers
      .handle("status", ({ query }) =>
        alarm.getArmState.pipe(
          provideShortcutAlarmScope({
            giid: query.giid,
            requiredScopes: [Server.ShortcutAlarmReadScope],
          }),
          Effect.catchTag("ServiceUnavailable", (error) =>
            Effect.fail(
              new ShortcutServiceUnavailableError({ message: error.message })
            )
          )
        )
      )
      .handle("toggleFull", ({ payload }) =>
        alarm.toggleFull(payload.code).pipe(
          provideShortcutAlarmScope({
            giid: payload.giid,
            requiredScopes: [Server.ShortcutAlarmWriteScope],
          }),
          Effect.catchTags({
            AlarmCodeRequired: (error) =>
              Effect.fail(
                new ShortcutInvalidInputError({ message: error.message })
              ),
            ServiceUnavailable: (error) =>
              Effect.fail(
                new ShortcutServiceUnavailableError({ message: error.message })
              ),
          })
        )
      )
      .handle("setMode", ({ payload }) =>
        alarm.setMode({ code: payload.code, mode: payload.mode }).pipe(
          provideShortcutAlarmScope({
            giid: payload.giid,
            requiredScopes: [Server.ShortcutAlarmWriteScope],
          }),
          Effect.catchTags({
            AlarmCodeRequired: (error) =>
              Effect.fail(
                new ShortcutInvalidInputError({ message: error.message })
              ),
            ServiceUnavailable: (error) =>
              Effect.fail(
                new ShortcutServiceUnavailableError({ message: error.message })
              ),
          })
        )
      );
  })
);
