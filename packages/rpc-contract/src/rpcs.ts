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
    success: DashboardSession,
    error: DashboardRpcError,
  }),
  Rpc.make("Logout", {
    error: DashboardRpcError,
  }),
).prefix("Auth.");

export const CredentialRpcs = RpcGroup.make(
  Rpc.make("ListCredentials", {
    success: Schema.Array(CredentialSummary),
    error: DashboardRpcError,
  }),
  Rpc.make("CreateCredential", {
    payload: CreateCredentialPayload,
    success: CredentialSummary,
    error: DashboardRpcError,
  }),
  Rpc.make("DeleteCredential", {
    payload: CredentialIdPayload,
    error: DashboardRpcError,
  }),
  Rpc.make("RequestCredentialMfa", {
    payload: CredentialIdPayload,
    success: MfaRequestResult,
    error: DashboardRpcError,
  }),
  Rpc.make("ValidateCredentialMfa", {
    payload: MfaCodePayload,
    success: MfaValidationResult,
    error: DashboardRpcError,
  }),
).prefix("Credential.");

export const InstallationRpcs = RpcGroup.make(
  Rpc.make("ListInstallations", {
    payload: CredentialIdPayload,
    success: Schema.Array(InstallationSummary),
    error: DashboardRpcError,
  }),
  Rpc.make("SetDefaultInstallation", {
    payload: CredentialInstallationPayload,
    success: CredentialSummary,
    error: DashboardRpcError,
  }),
).prefix("Installation.");

export const AlarmRpcs = RpcGroup.make(
  Rpc.make("GetArmState", {
    payload: AlarmStatusPayload,
    success: ArmState,
    error: DashboardRpcError,
  }),
  Rpc.make("SetAlarmMode", {
    payload: SetAlarmModePayload,
    success: AlarmMutationResult,
    error: DashboardRpcError,
  }),
  Rpc.make("ArmAway", {
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
    error: DashboardRpcError,
  }),
  Rpc.make("ArmHome", {
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
    error: DashboardRpcError,
  }),
  Rpc.make("Disarm", {
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
    error: DashboardRpcError,
  }),
  Rpc.make("ToggleFullAlarm", {
    payload: AlarmCommandPayload,
    success: AlarmMutationResult,
    error: DashboardRpcError,
  }),
).prefix("Alarm.");

export const DeviceRpcs = RpcGroup.make(
  Rpc.make("ListDoorWindows", {
    payload: AlarmStatusPayload,
    success: Schema.Array(DoorWindowSensorStatus),
    error: DashboardRpcError,
  }),
  Rpc.make("ListClimate", {
    payload: AlarmStatusPayload,
    success: Schema.Array(ClimateSensorStatus),
    error: DashboardRpcError,
  }),
  Rpc.make("ListSmartLocks", {
    payload: AlarmStatusPayload,
    success: Schema.Array(SmartLockStatus),
    error: DashboardRpcError,
  }),
  Rpc.make("ListSmartPlugs", {
    payload: AlarmStatusPayload,
    success: Schema.Array(SmartPlugStatus),
    error: DashboardRpcError,
  }),
).prefix("Device.");

export const ShortcutRpcs = RpcGroup.make(
  Rpc.make("ExportShortcut", {
    payload: ExportShortcutPayload,
    success: ShortcutExportResult,
    error: DashboardRpcError,
  }),
  Rpc.make("ListApiTokens", {
    payload: ListApiTokensPayload,
    success: Schema.Array(ApiTokenSummary),
    error: DashboardRpcError,
  }),
  Rpc.make("RevokeApiToken", {
    payload: RevokeApiTokenPayload,
    error: DashboardRpcError,
  }),
).prefix("Shortcut.");

export const DashboardRpcs = AuthRpcs.merge(
  CredentialRpcs,
  InstallationRpcs,
  AlarmRpcs,
  DeviceRpcs,
  ShortcutRpcs,
).middleware(DashboardAuthMiddleware);

export type DashboardRpcs = RpcGroup.Rpcs<typeof DashboardRpcs>;
