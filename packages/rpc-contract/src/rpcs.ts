import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { DashboardRpcError } from "./errors.ts";
import { DashboardAuthMiddleware } from "./middleware.ts";
import {
  AlarmCommandPayload,
  AlarmMutationResult,
  AlarmStatusPayload,
  ApiTokenSummary,
  ArmState,
  ClimateSensorStatus,
  CreateCredentialPayload,
  CredentialIdPayload,
  CredentialInstallationPayload,
  CredentialSummary,
  DashboardSession,
  DoorWindowSensorStatus,
  ExportShortcutPayload,
  InstallationSummary,
  ListApiTokensPayload,
  MfaCodePayload,
  MfaRequestResult,
  MfaValidationResult,
  RevokeApiTokenPayload,
  SetAlarmModePayload,
  ShortcutExportResult,
  SmartLockStatus,
  SmartPlugStatus,
} from "./schemas.ts";

export const AuthRpcs = RpcGroup.make(
  Rpc.make("GetSession", {
    error: DashboardRpcError,
    success: DashboardSession,
  }),
  Rpc.make("Logout", {
    error: DashboardRpcError,
  })
).prefix("Auth.");

export const CredentialRpcs = RpcGroup.make(
  Rpc.make("ListCredentials", {
    error: DashboardRpcError,
    success: Schema.Array(CredentialSummary),
  }),
  Rpc.make("CreateCredential", {
    error: DashboardRpcError,
    payload: CreateCredentialPayload,
    success: CredentialSummary,
  }),
  Rpc.make("DeleteCredential", {
    error: DashboardRpcError,
    payload: CredentialIdPayload,
  }),
  Rpc.make("RequestCredentialMfa", {
    error: DashboardRpcError,
    payload: CredentialIdPayload,
    success: MfaRequestResult,
  }),
  Rpc.make("ValidateCredentialMfa", {
    error: DashboardRpcError,
    payload: MfaCodePayload,
    success: MfaValidationResult,
  })
).prefix("Credential.");

export const InstallationRpcs = RpcGroup.make(
  Rpc.make("ListInstallations", {
    error: DashboardRpcError,
    payload: CredentialIdPayload,
    success: Schema.Array(InstallationSummary),
  }),
  Rpc.make("SetDefaultInstallation", {
    error: DashboardRpcError,
    payload: CredentialInstallationPayload,
    success: CredentialSummary,
  })
).prefix("Installation.");

export const AlarmRpcs = RpcGroup.make(
  Rpc.make("GetArmState", {
    error: DashboardRpcError,
    payload: AlarmStatusPayload,
    success: ArmState,
  }),
  Rpc.make("SetAlarmMode", {
    error: DashboardRpcError,
    payload: SetAlarmModePayload,
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

export const DeviceRpcs = RpcGroup.make(
  Rpc.make("ListDoorWindows", {
    error: DashboardRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(DoorWindowSensorStatus),
  }),
  Rpc.make("ListClimate", {
    error: DashboardRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(ClimateSensorStatus),
  }),
  Rpc.make("ListSmartLocks", {
    error: DashboardRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(SmartLockStatus),
  }),
  Rpc.make("ListSmartPlugs", {
    error: DashboardRpcError,
    payload: AlarmStatusPayload,
    success: Schema.Array(SmartPlugStatus),
  })
).prefix("Device.");

export const ShortcutRpcs = RpcGroup.make(
  Rpc.make("ExportShortcut", {
    error: DashboardRpcError,
    payload: ExportShortcutPayload,
    success: ShortcutExportResult,
  }),
  Rpc.make("ListApiTokens", {
    error: DashboardRpcError,
    payload: ListApiTokensPayload,
    success: Schema.Array(ApiTokenSummary),
  }),
  Rpc.make("RevokeApiToken", {
    error: DashboardRpcError,
    payload: RevokeApiTokenPayload,
  })
).prefix("Shortcut.");

export const DashboardRpcs = AuthRpcs.merge(
  CredentialRpcs,
  InstallationRpcs,
  AlarmRpcs,
  DeviceRpcs,
  ShortcutRpcs
).middleware(DashboardAuthMiddleware);

export type DashboardRpcs = RpcGroup.Rpcs<typeof DashboardRpcs>;
