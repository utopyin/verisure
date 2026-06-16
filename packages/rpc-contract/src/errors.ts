import * as Schema from "effect/Schema";

export class Unauthorized extends Schema.ErrorClass<Unauthorized>(
  "Unauthorized"
)({
  _tag: Schema.tag("Unauthorized"),
  message: Schema.String,
}) {}

export class Forbidden extends Schema.ErrorClass<Forbidden>("Forbidden")({
  _tag: Schema.tag("Forbidden"),
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

export class VerisureUpstreamError extends Schema.ErrorClass<VerisureUpstreamError>(
  "VerisureUpstreamError"
)({
  _tag: Schema.tag("VerisureUpstreamError"),
  kind: Schema.Literals([
    "RequestError",
    "AuthenticationError",
    "MFARequired",
    "CookieReadError",
    "CredentialsRejected",
    "LoginError",
    "RateLimitError",
    "LogoutError",
    "ResponseError",
    "GraphQLError",
  ]),
  message: Schema.String,
  statusCode: Schema.optionalKey(Schema.Number),
}) {}

export const DashboardRpcError = Schema.Union([
  Unauthorized,
  Forbidden,
  CredentialNotFound,
  InstallationNotFound,
  InvalidInput,
  VerisureUpstreamError,
]);
export type DashboardRpcError = Schema.Schema.Type<typeof DashboardRpcError>;
