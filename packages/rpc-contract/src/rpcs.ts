import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { DashboardRpcError } from "./errors";

const AlarmMode = Schema.Literals(["DISARMED", "ARMED_AWAY", "ARMED_HOME"]);

const InstallationSummary = Schema.Struct({
  address: Schema.optionalKey(
    Schema.Struct({
      city: Schema.optionalKey(Schema.String),
      postalNumber: Schema.optionalKey(Schema.String),
      street: Schema.optionalKey(Schema.String),
    })
  ),
  alias: Schema.String,
  customerType: Schema.optionalKey(Schema.String),
  dealerId: Schema.optionalKey(Schema.String),
  giid: Schema.String,
  locale: Schema.optionalKey(Schema.String),
  pinCodeLength: Schema.optionalKey(Schema.Finite),
  subsidiary: Schema.optionalKey(Schema.String),
});

const CredentialSummary = Schema.Struct({
  alias: Schema.String,
  connectionStatus: Schema.Literals([
    "unchecked",
    "connected",
    "mfa_required",
    "auth_failed",
    "rate_limited",
    "error",
  ]),
  createdAt: Schema.String,
  defaultGiid: Schema.optionalKey(Schema.String),
  email: Schema.String,
  id: Schema.String,
  updatedAt: Schema.String,
});

const CredentialIdPayload = Schema.Struct({
  credentialId: Schema.String,
});

const AlarmMutationResult = Schema.Struct({
  accepted: Schema.Boolean,
  giid: Schema.String,
  requestedMode: AlarmMode,
  transactionId: Schema.optionalKey(Schema.String),
});

const AlarmStatusPayload = Schema.Struct({
  credentialId: Schema.String,
  giid: Schema.String,
});

const AlarmCommandPayload = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  credentialId: Schema.String,
  giid: Schema.String,
});

const DeviceRef = Schema.Struct({
  area: Schema.optionalKey(Schema.String),
  deviceLabel: Schema.String,
  label: Schema.optionalKey(Schema.String),
});

const ShortcutTemplate = Schema.Literals(["toggle-full", "choose-mode"]);

export const AuthRpcs = RpcGroup.make(
  Rpc.make("GetSession", {
    error: DashboardRpcError,
    success: Schema.Struct({
      expiresAt: Schema.String,
      user: Schema.Struct({
        email: Schema.String,
        id: Schema.String,
        name: Schema.optionalKey(Schema.String),
      }),
    }),
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
    payload: Schema.Struct({
      alias: Schema.String,
      email: Schema.String,
      password: Schema.String,
      pin: Schema.optionalKey(Schema.String),
    }),
    success: CredentialSummary,
  }),
  Rpc.make("DeleteCredential", {
    error: DashboardRpcError,
    payload: CredentialIdPayload,
  }),
  Rpc.make("RequestCredentialMfa", {
    error: DashboardRpcError,
    payload: CredentialIdPayload,
    success: Schema.Struct({
      credentialId: Schema.String,
      deliveryHint: Schema.optionalKey(Schema.String),
      status: Schema.Literal("mfa_requested"),
    }),
  }),
  Rpc.make("ValidateCredentialMfa", {
    error: DashboardRpcError,
    payload: Schema.Struct({
      code: Schema.String,
      credentialId: Schema.String,
    }),
    success: Schema.Struct({
      credential: CredentialSummary,
      installations: Schema.Array(InstallationSummary),
    }),
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
    payload: Schema.Struct({
      credentialId: Schema.String,
      giid: Schema.String,
    }),
    success: CredentialSummary,
  })
).prefix("Installation.");

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

export const DeviceRpcs = RpcGroup.make(
  Rpc.make("ListDoorWindows", {
    error: DashboardRpcError,
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
    error: DashboardRpcError,
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
    error: DashboardRpcError,
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
    error: DashboardRpcError,
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

export const ShortcutRpcs = RpcGroup.make(
  Rpc.make("ExportShortcut", {
    error: DashboardRpcError,
    payload: Schema.Struct({
      credentialId: Schema.String,
      giid: Schema.optionalKey(Schema.String),
      template: ShortcutTemplate,
    }),
    success: Schema.Struct({
      apiUrl: Schema.String,
      bearerToken: Schema.String,
      credentialId: Schema.String,
      downloadUrl: Schema.optionalKey(Schema.String),
      giid: Schema.optionalKey(Schema.String),
      instructions: Schema.Array(Schema.String),
      shortcutName: Schema.String,
      template: ShortcutTemplate,
    }),
  }),
  Rpc.make("ListApiTokens", {
    error: DashboardRpcError,
    payload: Schema.Struct({
      credentialId: Schema.optionalKey(Schema.String),
    }),
    success: Schema.Array(
      Schema.Struct({
        allowedGiids: Schema.optionalKey(Schema.Array(Schema.String)),
        createdAt: Schema.String,
        credentialId: Schema.String,
        displayPrefix: Schema.String,
        expiresAt: Schema.optionalKey(Schema.String),
        id: Schema.String,
        lastUsedAt: Schema.optionalKey(Schema.String),
        revokedAt: Schema.optionalKey(Schema.String),
        scopes: Schema.Array(Schema.String),
      })
    ),
  }),
  Rpc.make("RevokeApiToken", {
    error: DashboardRpcError,
    payload: Schema.Struct({
      tokenId: Schema.String,
    }),
  })
).prefix("Shortcut.");

export const DashboardRpcs = AuthRpcs.merge(
  CredentialRpcs,
  InstallationRpcs,
  AlarmRpcs,
  DeviceRpcs,
  ShortcutRpcs
);

export type DashboardRpcs = RpcGroup.Rpcs<typeof DashboardRpcs>;
