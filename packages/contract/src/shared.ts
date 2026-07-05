import * as Schema from "effect/Schema";

export const AlarmMode = Schema.Literals([
  "DISARMED",
  "ARMED_AWAY",
  "ARMED_HOME",
]);

export const InstallationSummary = Schema.Struct({
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

export const CredentialSummary = Schema.Struct({
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

export const CredentialIdPayload = Schema.Struct({
  credentialId: Schema.String,
});

export const AlarmStatusPayload = Schema.Struct({
  credentialId: Schema.String,
  giid: Schema.String,
});
