import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
  CredentialNotFound,
  DeviceReadUnavailable,
  InstallationNotFound,
  InvalidInput,
  Unauthorized,
} from "../errors";
import { AlarmStatusPayload } from "./shared";

const DeviceRpcError = Schema.Union([
  Unauthorized,
  CredentialNotFound,
  InstallationNotFound,
  InvalidInput,
  DeviceReadUnavailable,
]);

const DeviceRef = Schema.Struct({
  area: Schema.optionalKey(Schema.String),
  deviceLabel: Schema.String,
  label: Schema.optionalKey(Schema.String),
});

export const DeviceRpcs = RpcGroup.make(
  Rpc.make("ListDoorWindows", {
    error: DeviceRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(
      Schema.Struct({
        area: Schema.optionalKey(Schema.String),
        device: DeviceRef,
        reportTime: Schema.optionalKey(Schema.String),
        state: Schema.String,
        type: Schema.optionalKey(Schema.String),
        wired: Schema.optionalKey(Schema.Boolean),
      })
    ),
  }),
  Rpc.make("ListClimate", {
    error: DeviceRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(
      Schema.Struct({
        device: DeviceRef,
        humidityEnabled: Schema.optionalKey(Schema.Boolean),
        humidityTimestamp: Schema.optionalKey(Schema.String),
        humidityValue: Schema.optionalKey(Schema.Finite),
        temperatureTimestamp: Schema.optionalKey(Schema.String),
        temperatureValue: Schema.optionalKey(Schema.Finite),
      })
    ),
  }),
  Rpc.make("ListSmartLocks", {
    error: DeviceRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(
      Schema.Struct({
        device: DeviceRef,
        doorLockType: Schema.optionalKey(Schema.String),
        doorState: Schema.optionalKey(Schema.String),
        eventTime: Schema.optionalKey(Schema.String),
        lockMethod: Schema.optionalKey(Schema.String),
        lockStatus: Schema.optionalKey(Schema.String),
        secureMode: Schema.optionalKey(Schema.Boolean),
        userName: Schema.optionalKey(Schema.String),
      })
    ),
  }),
  Rpc.make("ListSmartPlugs", {
    error: DeviceRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(
      Schema.Struct({
        currentState: Schema.Union([Schema.Boolean, Schema.String]),
        device: DeviceRef,
        icon: Schema.optionalKey(Schema.String),
        isHazardous: Schema.optionalKey(Schema.Boolean),
      })
    ),
  })
).prefix("Device.");
