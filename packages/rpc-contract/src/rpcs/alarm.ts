import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { DashboardRpcError } from "../errors";
import { AlarmMode, AlarmStatusPayload } from "./shared";

const AlarmMutationResult = Schema.Struct({
  accepted: Schema.Boolean,
  giid: Schema.String,
  requestedMode: AlarmMode,
  transactionId: Schema.optionalKey(Schema.String),
});

const AlarmCommandPayload = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  credentialId: Schema.String,
  giid: Schema.String,
});

export const AlarmRpcs = RpcGroup.make(
  Rpc.make("GetArmState", {
    error: DashboardRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Struct({
      changedVia: Schema.optionalKey(Schema.String),
      date: Schema.optionalKey(Schema.String),
      name: Schema.optionalKey(Schema.String),
      statusType: Schema.optionalKey(Schema.String),
      type: Schema.String,
    }),
  }),
  Rpc.make("SetAlarmMode", {
    error: DashboardRpcError,
    payload: Schema.Struct({
      code: Schema.optionalKey(Schema.String),
      credentialId: Schema.String,
      giid: Schema.String,
      mode: AlarmMode,
    }),
    success: AlarmMutationResult,
  }),
  Rpc.make("ArmAway", {
    error: DashboardRpcError,
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
  }),
  Rpc.make("ArmHome", {
    error: DashboardRpcError,
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
  }),
  Rpc.make("Disarm", {
    error: DashboardRpcError,
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
  }),
  Rpc.make("ToggleFullAlarm", {
    error: DashboardRpcError,
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
  })
).prefix("Alarm.");
