import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";

import { toDashboardRpcError } from "../Http/ErrorMapper";
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
      alarm
        .setMode({ code: payload.code, mode: "ARMED_AWAY" })
        .pipe(Effect.mapError(toDashboardRpcError)),
    "Alarm.ArmHome": (payload) =>
      alarm
        .setMode({ code: payload.code, mode: "ARMED_HOME" })
        .pipe(Effect.mapError(toDashboardRpcError)),
    "Alarm.Disarm": (payload) =>
      alarm
        .setMode({ code: payload.code, mode: "DISARMED" })
        .pipe(Effect.mapError(toDashboardRpcError)),
    "Alarm.GetArmState": () =>
      alarm.getArmState.pipe(Effect.mapError(toDashboardRpcError)),
    "Alarm.SetAlarmMode": (payload) =>
      alarm
        .setMode({ code: payload.code, mode: payload.mode })
        .pipe(Effect.mapError(toDashboardRpcError)),
    "Alarm.ToggleFullAlarm": (payload) =>
      alarm.toggleFull(payload.code).pipe(Effect.mapError(toDashboardRpcError)),
  });
});
