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

export class ServiceUnavailable extends Schema.ErrorClass<ServiceUnavailable>(
  "ServiceUnavailable"
)({
  _tag: Schema.tag("ServiceUnavailable"),
  message: Schema.String,
}) {}

export class AlarmCodeRequired extends Schema.ErrorClass<AlarmCodeRequired>(
  "AlarmCodeRequired"
)({
  _tag: Schema.tag("AlarmCodeRequired"),
  message: Schema.String,
}) {}

export class ApiTokenNotFound extends Schema.ErrorClass<ApiTokenNotFound>(
  "ApiTokenNotFound"
)({
  _tag: Schema.tag("ApiTokenNotFound"),
  message: Schema.String,
}) {}

export const CredentialScopeError = Schema.Union([
  CredentialNotFound,
  InvalidInput,
]);

export const InstallationScopeError = Schema.Union([
  InstallationNotFound,
  InvalidInput,
]);
