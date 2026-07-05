import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export class RequestError extends Schema.TaggedErrorClass<RequestError>()(
  "RequestError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}

export class AuthenticationError extends Schema.TaggedErrorClass<AuthenticationError>()(
  "AuthenticationError",
  {
    message: Schema.String,
    statusCode: Schema.optionalKey(Schema.Finite),
  }
) {}

export class MFARequired extends Schema.TaggedErrorClass<MFARequired>()(
  "MFARequired",
  {
    message: Schema.String,
    statusCode: Schema.optionalKey(Schema.Finite),
  }
) {}

export class CookieReadError extends Schema.TaggedErrorClass<CookieReadError>()(
  "CookieReadError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}

export class CredentialsRejected extends Schema.TaggedErrorClass<CredentialsRejected>()(
  "CredentialsRejected",
  {
    message: Schema.String,
    statusCode: Schema.optionalKey(Schema.Finite),
  }
) {}

export class LoginError extends Schema.TaggedErrorClass<LoginError>()(
  "LoginError",
  {
    message: Schema.String,
    statusCode: Schema.optionalKey(Schema.Finite),
  }
) {}

export class RateLimitError extends Schema.TaggedErrorClass<RateLimitError>()(
  "RateLimitError",
  {
    message: Schema.String,
    statusCode: Schema.optionalKey(Schema.Finite),
  }
) {}

export class LogoutError extends Schema.TaggedErrorClass<LogoutError>()(
  "LogoutError",
  {
    message: Schema.String,
    statusCode: Schema.optionalKey(Schema.Finite),
  }
) {}

export class ResponseError extends Schema.TaggedErrorClass<ResponseError>()(
  "ResponseError",
  {
    message: Schema.String,
    statusCode: Schema.Finite,
    text: Schema.String,
  }
) {}

export class GraphQLError extends Schema.TaggedErrorClass<GraphQLError>()(
  "GraphQLError",
  {
    errors: Schema.optionalKey(Schema.Unknown),
    message: Schema.String,
    operationName: Schema.optionalKey(Schema.String),
  }
) {}

export type VerisureDomainError =
  | RequestError
  | AuthenticationError
  | MFARequired
  | CookieReadError
  | CredentialsRejected
  | LoginError
  | RateLimitError
  | LogoutError
  | ResponseError
  | GraphQLError;

export const responseSignalsRateLimit = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes("aut_00021") ||
    lower.includes("request limit") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  );
};

export const classifyHttpError = (
  statusCode: number,
  text: string
):
  | AuthenticationError
  | CredentialsRejected
  | LoginError
  | RateLimitError
  | ResponseError => {
  if (statusCode === 401 || statusCode === 403) {
    return new AuthenticationError({ message: text, statusCode });
  }
  if (statusCode === 429 || responseSignalsRateLimit(text)) {
    return new RateLimitError({ message: text, statusCode });
  }
  if (statusCode >= 500) {
    return new ResponseError({
      message: `Invalid response, status code: ${statusCode} - Data: ${text}`,
      statusCode,
      text,
    });
  }
  if (statusCode === 400) {
    return new CredentialsRejected({ message: text, statusCode });
  }
  return new LoginError({ message: text, statusCode });
};

export const classifyGraphQLResponse = (
  response: unknown,
  operationName?: string
): GraphQLError | undefined => {
  const payload = decodeGraphQLErrorPayload(response);
  if (Option.isSome(payload)) {
    return new GraphQLError({
      errors: payload.value.errors,
      message: "Verisure GraphQL response contained errors",
      operationName,
    });
  }
  return undefined;
};

const GraphQLErrorPayload = Schema.Struct({ errors: Schema.Unknown });
const decodeGraphQLErrorPayload =
  Schema.decodeUnknownOption(GraphQLErrorPayload);
