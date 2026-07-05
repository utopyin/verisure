import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";

import { AuthMiddleware } from "./AuthMiddleware";
import {
  CredentialScopeMiddleware,
  InstallationScopeMiddleware,
} from "./ScopeMiddleware";

export const Rpcs = RpcContract.AlarmRpcs.middleware(
  InstallationScopeMiddleware
)
  .middleware(CredentialScopeMiddleware)
  .middleware(AuthMiddleware);

export const alarmHandlers = Effect.gen(function* () {
  const alarm = yield* Server.AlarmService;

  return Rpcs.of({
    "Alarm.ArmAway": (payload) =>
      alarm.setMode({ code: payload.code, mode: "ARMED_AWAY" }).pipe(
        Effect.catchTags({
          AlarmCodeRequired: (error) =>
            Effect.fail(
              new RpcContract.AlarmCodeRequired({ message: error.message })
            ),
          ServiceUnavailable: (error) =>
            Effect.fail(
              new RpcContract.ServiceUnavailable({ message: error.message })
            ),
        })
      ),
    "Alarm.ArmHome": (payload) =>
      alarm.setMode({ code: payload.code, mode: "ARMED_HOME" }).pipe(
        Effect.catchTags({
          AlarmCodeRequired: (error) =>
            Effect.fail(
              new RpcContract.AlarmCodeRequired({ message: error.message })
            ),
          ServiceUnavailable: (error) =>
            Effect.fail(
              new RpcContract.ServiceUnavailable({ message: error.message })
            ),
        })
      ),
    "Alarm.Disarm": (payload) =>
      alarm.setMode({ code: payload.code, mode: "DISARMED" }).pipe(
        Effect.catchTags({
          AlarmCodeRequired: (error) =>
            Effect.fail(
              new RpcContract.AlarmCodeRequired({ message: error.message })
            ),
          ServiceUnavailable: (error) =>
            Effect.fail(
              new RpcContract.ServiceUnavailable({ message: error.message })
            ),
        })
      ),
    "Alarm.GetArmState": () =>
      alarm.getArmState.pipe(
        Effect.catchTag("ServiceUnavailable", (error) =>
          Effect.fail(
            new RpcContract.ServiceUnavailable({ message: error.message })
          )
        )
      ),
    "Alarm.SetAlarmMode": (payload) =>
      alarm.setMode({ code: payload.code, mode: payload.mode }).pipe(
        Effect.catchTags({
          AlarmCodeRequired: (error) =>
            Effect.fail(
              new RpcContract.AlarmCodeRequired({ message: error.message })
            ),
          ServiceUnavailable: (error) =>
            Effect.fail(
              new RpcContract.ServiceUnavailable({ message: error.message })
            ),
        })
      ),
    "Alarm.ToggleFullAlarm": (payload) =>
      alarm.toggleFull(payload.code).pipe(
        Effect.catchTags({
          AlarmCodeRequired: (error) =>
            Effect.fail(
              new RpcContract.AlarmCodeRequired({ message: error.message })
            ),
          ServiceUnavailable: (error) =>
            Effect.fail(
              new RpcContract.ServiceUnavailable({ message: error.message })
            ),
        })
      ),
  });
});
