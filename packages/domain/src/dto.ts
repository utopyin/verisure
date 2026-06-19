import * as Schema from "effect/Schema";

export const AlarmModes = ["DISARMED", "ARMED_AWAY", "ARMED_HOME"] as const;
export const AlarmModeSchema = Schema.Literals(AlarmModes);
export type AlarmMode = Schema.Schema.Type<typeof AlarmModeSchema>;

export const ShortcutAlarmModes = ["DISARMED", "ARMED_AWAY"] as const;
export const ShortcutAlarmModeSchema = Schema.Literals(ShortcutAlarmModes);
export type ShortcutAlarmMode = Schema.Schema.Type<
  typeof ShortcutAlarmModeSchema
>;

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

export const InstallationAddressSchema = Schema.Struct({
  city: Schema.optionalKey(Schema.String),
  postalNumber: Schema.optionalKey(Schema.String),
  street: Schema.optionalKey(Schema.String),
});
export type InstallationAddress = Schema.Schema.Type<
  typeof InstallationAddressSchema
>;

export const InstallationSummarySchema = Schema.Struct({
  address: Schema.optionalKey(InstallationAddressSchema),
  alias: Schema.String,
  customerType: Schema.optionalKey(Schema.String),
  dealerId: Schema.optionalKey(Schema.String),
  giid: Schema.String,
  locale: Schema.optionalKey(Schema.String),
  pinCodeLength: Schema.optionalKey(Schema.Number),
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

export const DeviceRefSchema = Schema.Struct({
  area: Schema.optionalKey(Schema.String),
  deviceLabel: Schema.String,
  label: Schema.optionalKey(Schema.String),
});
export type DeviceRef = Schema.Schema.Type<typeof DeviceRefSchema>;

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
  humidityValue: Schema.optionalKey(Schema.Number),
  temperatureTimestamp: Schema.optionalKey(Schema.String),
  temperatureValue: Schema.optionalKey(Schema.Number),
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

export interface EventLogEntry {
  readonly eventId: string;
  readonly eventTime: string;
  readonly eventType?: string;
  readonly eventCategory?: string;
  readonly userName?: string;
  readonly armState?: string;
  readonly device?: DeviceRef;
}

export interface ApiTokenSummary {
  readonly id: string;
  readonly credentialId: string;
  readonly displayPrefix: string;
  readonly scopes: readonly string[];
  readonly allowedGiids?: readonly string[];
  readonly expiresAt?: Date;
  readonly lastUsedAt?: Date;
  readonly revokedAt?: Date;
  readonly createdAt: Date;
}

export type ShortcutTemplate = "toggle-full" | "choose-mode";

export interface ShortcutExportResult {
  readonly template: ShortcutTemplate;
  readonly apiUrl: string;
  readonly bearerToken: string;
  readonly credentialId: string;
  readonly giid?: string;
  readonly shortcutName: string;
  readonly instructions: readonly string[];
  readonly downloadUrl?: string;
}
