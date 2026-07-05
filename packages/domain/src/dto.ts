import * as Schema from "effect/Schema";

const AlarmModes = ["DISARMED", "ARMED_AWAY", "ARMED_HOME"] as const;
export const AlarmModeSchema = Schema.Literals(AlarmModes);
export type AlarmMode = Schema.Schema.Type<typeof AlarmModeSchema>;

export const ConnectionStatusSchema = Schema.Literals([
  "unchecked",
  "connected",
  "mfa_required",
  "auth_failed",
  "rate_limited",
  "error",
]);
export type ConnectionStatus = Schema.Schema.Type<
  typeof ConnectionStatusSchema
>;

export const CredentialSummarySchema = Schema.Struct({
  alias: Schema.String,
  connectionStatus: ConnectionStatusSchema,
  createdAt: Schema.String,
  defaultGiid: Schema.optionalKey(Schema.String),
  email: Schema.String,
  id: Schema.String,
  updatedAt: Schema.String,
});
export type CredentialSummary = Schema.Schema.Type<
  typeof CredentialSummarySchema
>;

export const MfaRequestResultSchema = Schema.Struct({
  credentialId: Schema.String,
  deliveryHint: Schema.optionalKey(Schema.String),
  status: Schema.Literal("mfa_requested"),
});
export type MfaRequestResult = Schema.Schema.Type<
  typeof MfaRequestResultSchema
>;

const InstallationAddressSchema = Schema.Struct({
  city: Schema.optionalKey(Schema.String),
  postalNumber: Schema.optionalKey(Schema.String),
  street: Schema.optionalKey(Schema.String),
});
export const InstallationSummarySchema = Schema.Struct({
  address: Schema.optionalKey(InstallationAddressSchema),
  alias: Schema.String,
  customerType: Schema.optionalKey(Schema.String),
  dealerId: Schema.optionalKey(Schema.String),
  giid: Schema.String,
  locale: Schema.optionalKey(Schema.String),
  pinCodeLength: Schema.optionalKey(Schema.Finite),
  subsidiary: Schema.optionalKey(Schema.String),
});
export type InstallationSummary = Schema.Schema.Type<
  typeof InstallationSummarySchema
>;

export const MfaValidationResultSchema = Schema.Struct({
  credential: CredentialSummarySchema,
  installations: Schema.Array(InstallationSummarySchema),
});
export type MfaValidationResult = Schema.Schema.Type<
  typeof MfaValidationResultSchema
>;

export const ArmStateSchema = Schema.Struct({
  changedVia: Schema.optionalKey(Schema.String),
  date: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  statusType: Schema.optionalKey(Schema.String),
  type: Schema.String,
});
export type ArmState = Schema.Schema.Type<typeof ArmStateSchema>;

export const AlarmMutationResultSchema = Schema.Struct({
  accepted: Schema.Boolean,
  giid: Schema.String,
  requestedMode: AlarmModeSchema,
  transactionId: Schema.optionalKey(Schema.String),
});
export type AlarmMutationResult = Schema.Schema.Type<
  typeof AlarmMutationResultSchema
>;

const DeviceRefSchema = Schema.Struct({
  area: Schema.optionalKey(Schema.String),
  deviceLabel: Schema.String,
  label: Schema.optionalKey(Schema.String),
});
export const DoorWindowSensorStatusSchema = Schema.Struct({
  area: Schema.optionalKey(Schema.String),
  device: DeviceRefSchema,
  reportTime: Schema.optionalKey(Schema.String),
  state: Schema.String,
  type: Schema.optionalKey(Schema.String),
  wired: Schema.optionalKey(Schema.Boolean),
});
export type DoorWindowSensorStatus = Schema.Schema.Type<
  typeof DoorWindowSensorStatusSchema
>;

export const ClimateSensorStatusSchema = Schema.Struct({
  device: DeviceRefSchema,
  humidityEnabled: Schema.optionalKey(Schema.Boolean),
  humidityTimestamp: Schema.optionalKey(Schema.String),
  humidityValue: Schema.optionalKey(Schema.Finite),
  temperatureTimestamp: Schema.optionalKey(Schema.String),
  temperatureValue: Schema.optionalKey(Schema.Finite),
});
export type ClimateSensorStatus = Schema.Schema.Type<
  typeof ClimateSensorStatusSchema
>;

export const SmartLockStatusSchema = Schema.Struct({
  device: DeviceRefSchema,
  doorLockType: Schema.optionalKey(Schema.String),
  doorState: Schema.optionalKey(Schema.String),
  eventTime: Schema.optionalKey(Schema.String),
  lockMethod: Schema.optionalKey(Schema.String),
  lockStatus: Schema.optionalKey(Schema.String),
  secureMode: Schema.optionalKey(Schema.Boolean),
  userName: Schema.optionalKey(Schema.String),
});
export type SmartLockStatus = Schema.Schema.Type<typeof SmartLockStatusSchema>;

export const SmartPlugStatusSchema = Schema.Struct({
  currentState: Schema.Union([Schema.Boolean, Schema.String]),
  device: DeviceRefSchema,
  icon: Schema.optionalKey(Schema.String),
  isHazardous: Schema.optionalKey(Schema.Boolean),
});
export type SmartPlugStatus = Schema.Schema.Type<typeof SmartPlugStatusSchema>;

export type ShortcutTemplate = "toggle-full" | "choose-mode";
