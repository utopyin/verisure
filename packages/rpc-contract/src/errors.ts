import * as Schema from "effect/Schema";

export class Unauthorized extends Schema.ErrorClass<Unauthorized>(
  "Unauthorized"
)({
  _tag: Schema.tag("Unauthorized"),
  message: Schema.String,
}) {}

export class CredentialNotFound extends Schema.ErrorClass<CredentialNotFound>(
  "CredentialNotFound"
)({
  _tag: Schema.tag("CredentialNotFound"),
  credentialId: Schema.String,
  message: Schema.String,
}) {}

export class InstallationNotFound extends Schema.ErrorClass<InstallationNotFound>(
  "InstallationNotFound"
)({
  _tag: Schema.tag("InstallationNotFound"),
  giid: Schema.String,
  message: Schema.String,
}) {}

export class InvalidInput extends Schema.ErrorClass<InvalidInput>(
  "InvalidInput"
)({
  _tag: Schema.tag("InvalidInput"),
  field: Schema.optionalKey(Schema.String),
  message: Schema.String,
}) {}

export class DeviceReadUnavailable extends Schema.ErrorClass<DeviceReadUnavailable>(
  "DeviceReadUnavailable"
)({
  _tag: Schema.tag("DeviceReadUnavailable"),
  message: Schema.String,
}) {}

export class AlarmUnavailable extends Schema.ErrorClass<AlarmUnavailable>(
  "AlarmUnavailable"
)({
  _tag: Schema.tag("AlarmUnavailable"),
  message: Schema.String,
}) {}

export class AlarmCodeRequired extends Schema.ErrorClass<AlarmCodeRequired>(
  "AlarmCodeRequired"
)({
  _tag: Schema.tag("AlarmCodeRequired"),
  message: Schema.String,
}) {}

export class CredentialUnavailable extends Schema.ErrorClass<CredentialUnavailable>(
  "CredentialUnavailable"
)({
  _tag: Schema.tag("CredentialUnavailable"),
  message: Schema.String,
}) {}

export class InstallationUnavailable extends Schema.ErrorClass<InstallationUnavailable>(
  "InstallationUnavailable"
)({
  _tag: Schema.tag("InstallationUnavailable"),
  message: Schema.String,
}) {}

export class ShortcutUnavailable extends Schema.ErrorClass<ShortcutUnavailable>(
  "ShortcutUnavailable"
)({
  _tag: Schema.tag("ShortcutUnavailable"),
  message: Schema.String,
}) {}

export class ApiTokenNotFound extends Schema.ErrorClass<ApiTokenNotFound>(
  "ApiTokenNotFound"
)({
  _tag: Schema.tag("ApiTokenNotFound"),
  message: Schema.String,
}) {}

export const ScopedRpcError = Schema.Union([
  Unauthorized,
  CredentialNotFound,
  InstallationNotFound,
  InvalidInput,
]);
