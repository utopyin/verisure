import * as Schema from "effect/Schema";

export class ServiceUnavailable extends Schema.TaggedErrorClass<ServiceUnavailable>()(
  "ServiceUnavailable",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}

export class AlarmCodeRequired extends Schema.TaggedErrorClass<AlarmCodeRequired>()(
  "AlarmCodeRequired",
  {
    message: Schema.String,
  }
) {}

export class CredentialNotFound extends Schema.TaggedErrorClass<CredentialNotFound>()(
  "CredentialNotFound",
  {
    credentialId: Schema.String,
    message: Schema.String,
  }
) {}

export class ApiTokenNotFound extends Schema.TaggedErrorClass<ApiTokenNotFound>()(
  "ApiTokenNotFound",
  {
    message: Schema.String,
  }
) {}

export class ApiTokenUnauthorized extends Schema.TaggedErrorClass<ApiTokenUnauthorized>()(
  "ApiTokenUnauthorized",
  {
    message: Schema.String,
  }
) {}

export class ApiTokenForbidden extends Schema.TaggedErrorClass<ApiTokenForbidden>()(
  "ApiTokenForbidden",
  {
    message: Schema.String,
  }
) {}
