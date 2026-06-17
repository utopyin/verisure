export const AlarmModes = ["DISARMED", "ARMED_AWAY", "ARMED_HOME"] as const;
export type AlarmMode = (typeof AlarmModes)[number];

export const ShortcutAlarmModes = ["DISARMED", "ARMED_AWAY"] as const;
export type ShortcutAlarmMode = (typeof ShortcutAlarmModes)[number];

export type ConnectionStatus =
  | "unchecked"
  | "connected"
  | "mfa_required"
  | "auth_failed"
  | "rate_limited"
  | "error";

export interface InstallationAddress {
  readonly street?: string;
  readonly city?: string;
  readonly postalNumber?: string;
}

export interface InstallationSummary {
  readonly giid: string;
  readonly alias: string;
  readonly customerType?: string;
  readonly dealerId?: string;
  readonly subsidiary?: string;
  readonly pinCodeLength?: number;
  readonly locale?: string;
  readonly address?: InstallationAddress;
}

export interface ArmState {
  readonly type: AlarmMode | string;
  readonly statusType?: string;
  readonly date?: string;
  readonly name?: string;
  readonly changedVia?: string;
}

export interface AlarmMutationResult {
  readonly giid: string;
  readonly requestedMode: AlarmMode;
  readonly transactionId?: string;
  readonly accepted: boolean;
}

export interface DeviceRef {
  readonly deviceLabel: string;
  readonly area?: string;
  readonly label?: string;
}

export interface DoorWindowSensorStatus {
  readonly device: DeviceRef;
  readonly type?: string;
  readonly area?: string;
  readonly state: string;
  readonly wired?: boolean;
  readonly reportTime?: string;
}

export interface ClimateSensorStatus {
  readonly device: DeviceRef;
  readonly humidityEnabled?: boolean;
  readonly humidityTimestamp?: string;
  readonly humidityValue?: number;
  readonly temperatureTimestamp?: string;
  readonly temperatureValue?: number;
}

export interface SmartLockStatus {
  readonly device: DeviceRef;
  readonly lockStatus?: string;
  readonly doorState?: string;
  readonly lockMethod?: string;
  readonly eventTime?: string;
  readonly doorLockType?: string;
  readonly secureMode?: boolean;
  readonly userName?: string;
}

export interface SmartPlugStatus {
  readonly device: DeviceRef;
  readonly currentState: boolean | string;
  readonly icon?: string;
  readonly isHazardous?: boolean;
}

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
