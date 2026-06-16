import * as Data from "effect/Data";

export class RequestError extends Data.TaggedError("RequestError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AuthenticationError extends Data.TaggedError(
  "AuthenticationError"
)<{
  readonly message: string;
  readonly statusCode?: number;
}> {}

export class MFARequired extends Data.TaggedError("MFARequired")<{
  readonly message: string;
  readonly statusCode?: number;
}> {}

export class CookieReadError extends Data.TaggedError("CookieReadError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class CredentialsRejected extends Data.TaggedError(
  "CredentialsRejected"
)<{
  readonly message: string;
  readonly statusCode?: number;
}> {}

export class LoginError extends Data.TaggedError("LoginError")<{
  readonly message: string;
  readonly statusCode?: number;
}> {}

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly message: string;
  readonly statusCode?: number;
}> {}

export class LogoutError extends Data.TaggedError("LogoutError")<{
  readonly message: string;
  readonly statusCode?: number;
}> {}

export class ResponseError extends Data.TaggedError("ResponseError")<{
  readonly message: string;
  readonly statusCode: number;
  readonly text: string;
}> {}

export class GraphQLError extends Data.TaggedError("GraphQLError")<{
  readonly message: string;
  readonly operationName?: string;
  readonly errors?: unknown;
}> {}

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
  if (
    typeof response === "object" &&
    response !== null &&
    "errors" in response
  ) {
    return new GraphQLError({
      errors: (response as { readonly errors: unknown }).errors,
      message: "Verisure GraphQL response contained errors",
      operationName,
    });
  }
  return undefined;
};
