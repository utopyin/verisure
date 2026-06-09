import * as Schema from "effect/Schema";

export class DashboardUser extends Schema.Class<DashboardUser>("DashboardUser")({
  id: Schema.String,
  email: Schema.String,
  name: Schema.optionalKey(Schema.String),
}) {}

export class DashboardSession extends Schema.Class<DashboardSession>("DashboardSession")({
  user: DashboardUser,
  expiresAt: Schema.String,
}) {}

export const ConnectionStatus = Schema.Literals([
  "unchecked",
  "connected",
  "mfa_required",
  "auth_failed",
  "rate_limited",
  "error",
]);
export type ConnectionStatus = Schema.Schema.Type<typeof ConnectionStatus>;

export const AlarmMode = Schema.Literals(["DISARMED", "ARMED_AWAY", "ARMED_HOME"]);
export type AlarmMode = Schema.Schema.Type<typeof AlarmMode>;

export const ShortcutAlarmMode = Schema.Literals(["DISARMED", "ARMED_AWAY"]);
export type ShortcutAlarmMode = Schema.Schema.Type<typeof ShortcutAlarmMode>;

export class InstallationAddress extends Schema.Class<InstallationAddress>(
  "InstallationAddress",
)({
  street: Schema.optionalKey(Schema.String),
  city: Schema.optionalKey(Schema.String),
  postalNumber: Schema.optionalKey(Schema.String),
}) {}

export class InstallationSummary extends Schema.Class<InstallationSummary>(
  "InstallationSummary",
)({
  giid: Schema.String,
  alias: Schema.String,
  customerType: Schema.optionalKey(Schema.String),
  dealerId: Schema.optionalKey(Schema.String),
  subsidiary: Schema.optionalKey(Schema.String),
  pinCodeLength: Schema.optionalKey(Schema.Number),
  locale: Schema.optionalKey(Schema.String),
  address: Schema.optionalKey(InstallationAddress),
}) {}

export class CredentialSummary extends Schema.Class<CredentialSummary>(
  "CredentialSummary",
)({
  id: Schema.String,
  alias: Schema.String,
  email: Schema.String,
  connectionStatus: ConnectionStatus,
  defaultGiid: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

export class MfaRequestResult extends Schema.Class<MfaRequestResult>(
  "MfaRequestResult",
)({
  credentialId: Schema.String,
  status: Schema.Literal("mfa_requested"),
  deliveryHint: Schema.optionalKey(Schema.String),
}) {}

export class MfaValidationResult extends Schema.Class<MfaValidationResult>(
  "MfaValidationResult",
)({
  credential: CredentialSummary,
  installations: Schema.Array(InstallationSummary),
}) {}

export class CreateCredentialPayload extends Schema.Class<CreateCredentialPayload>(
  "CreateCredentialPayload",
)({
  alias: Schema.String,
  email: Schema.String,
  password: Schema.String,
  pin: Schema.optionalKey(Schema.String),
}) {}

export class CredentialIdPayload extends Schema.Class<CredentialIdPayload>(
  "CredentialIdPayload",
)({
  credentialId: Schema.String,
}) {}

export class MfaCodePayload extends Schema.Class<MfaCodePayload>("MfaCodePayload")({
  credentialId: Schema.String,
  code: Schema.String,
}) {}

export class CredentialInstallationPayload extends Schema.Class<CredentialInstallationPayload>(
  "CredentialInstallationPayload",
)({
  credentialId: Schema.String,
  giid: Schema.String,
}) {}

export class ArmState extends Schema.Class<ArmState>("ArmState")({
  type: Schema.String,
  statusType: Schema.optionalKey(Schema.String),
  date: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  changedVia: Schema.optionalKey(Schema.String),
}) {}

export class AlarmMutationResult extends Schema.Class<AlarmMutationResult>(
  "AlarmMutationResult",
)({
  giid: Schema.String,
  requestedMode: AlarmMode,
  accepted: Schema.Boolean,
  transactionId: Schema.optionalKey(Schema.String),
}) {}

export class AlarmStatusPayload extends Schema.Class<AlarmStatusPayload>(
  "AlarmStatusPayload",
)({
  credentialId: Schema.String,
  giid: Schema.String,
}) {}

export class SetAlarmModePayload extends Schema.Class<SetAlarmModePayload>(
  "SetAlarmModePayload",
)({
  credentialId: Schema.String,
  giid: Schema.String,
  mode: AlarmMode,
  code: Schema.optionalKey(Schema.String),
}) {}

export class AlarmCommandPayload extends Schema.Class<AlarmCommandPayload>(
  "AlarmCommandPayload",
)({
  credentialId: Schema.String,
  giid: Schema.String,
  code: Schema.optionalKey(Schema.String),
}) {}

export class DeviceRef extends Schema.Class<DeviceRef>("DeviceRef")({
  deviceLabel: Schema.String,
  area: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
}) {}

export class DoorWindowSensorStatus extends Schema.Class<DoorWindowSensorStatus>(
  "DoorWindowSensorStatus",
)({
  device: DeviceRef,
  type: Schema.optionalKey(Schema.String),
  area: Schema.optionalKey(Schema.String),
  state: Schema.String,
  wired: Schema.optionalKey(Schema.Boolean),
  reportTime: Schema.optionalKey(Schema.String),
}) {}

export class ClimateSensorStatus extends Schema.Class<ClimateSensorStatus>(
  "ClimateSensorStatus",
)({
  device: DeviceRef,
  humidityEnabled: Schema.optionalKey(Schema.Boolean),
  humidityTimestamp: Schema.optionalKey(Schema.String),
  humidityValue: Schema.optionalKey(Schema.Number),
  temperatureTimestamp: Schema.optionalKey(Schema.String),
  temperatureValue: Schema.optionalKey(Schema.Number),
}) {}

export class SmartLockStatus extends Schema.Class<SmartLockStatus>("SmartLockStatus")({
  device: DeviceRef,
  lockStatus: Schema.optionalKey(Schema.String),
  doorState: Schema.optionalKey(Schema.String),
  lockMethod: Schema.optionalKey(Schema.String),
  eventTime: Schema.optionalKey(Schema.String),
  doorLockType: Schema.optionalKey(Schema.String),
  secureMode: Schema.optionalKey(Schema.Boolean),
  userName: Schema.optionalKey(Schema.String),
}) {}

export class SmartPlugStatus extends Schema.Class<SmartPlugStatus>("SmartPlugStatus")({
  device: DeviceRef,
  currentState: Schema.Union([Schema.Boolean, Schema.String]),
  icon: Schema.optionalKey(Schema.String),
  isHazardous: Schema.optionalKey(Schema.Boolean),
}) {}

export const ShortcutTemplate = Schema.Literals(["toggle-full", "choose-mode"]);
export type ShortcutTemplate = Schema.Schema.Type<typeof ShortcutTemplate>;

export class ApiTokenSummary extends Schema.Class<ApiTokenSummary>("ApiTokenSummary")({
  id: Schema.String,
  credentialId: Schema.String,
  displayPrefix: Schema.String,
  scopes: Schema.Array(Schema.String),
  allowedGiids: Schema.optionalKey(Schema.Array(Schema.String)),
  expiresAt: Schema.optionalKey(Schema.String),
  lastUsedAt: Schema.optionalKey(Schema.String),
  revokedAt: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
}) {}

export class ExportShortcutPayload extends Schema.Class<ExportShortcutPayload>(
  "ExportShortcutPayload",
)({
  credentialId: Schema.String,
  giid: Schema.optionalKey(Schema.String),
  template: ShortcutTemplate,
}) {}

export class ShortcutExportResult extends Schema.Class<ShortcutExportResult>(
  "ShortcutExportResult",
)({
  template: ShortcutTemplate,
  apiUrl: Schema.String,
  bearerToken: Schema.String,
  credentialId: Schema.String,
  giid: Schema.optionalKey(Schema.String),
  shortcutName: Schema.String,
  instructions: Schema.Array(Schema.String),
  downloadUrl: Schema.optionalKey(Schema.String),
}) {}

export class ListApiTokensPayload extends Schema.Class<ListApiTokensPayload>(
  "ListApiTokensPayload",
)({
  credentialId: Schema.optionalKey(Schema.String),
}) {}

export class RevokeApiTokenPayload extends Schema.Class<RevokeApiTokenPayload>(
  "RevokeApiTokenPayload",
)({
  tokenId: Schema.String,
}) {}
