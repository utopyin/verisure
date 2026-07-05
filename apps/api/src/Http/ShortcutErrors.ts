import * as Domain from "@verisure/domain";
import * as Server from "@verisure/server";
import { PlatformError } from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

export type VerisureSafeUpstreamError =
  | Domain.AuthenticationError
  | Domain.CookieReadError
  | Domain.CredentialsRejected
  | Domain.GraphQLError
  | Domain.LoginError
  | Domain.LogoutError
  | Domain.MFARequired
  | Domain.RateLimitError
  | Domain.RequestError
  | Domain.ResponseError;

export type ShortcutApplicationError =
  | PlatformError
  | Server.ApiTokenError
  | Server.CredentialCryptoError
  | Server.RepositoryError
  | Server.ScopeError
  | Server.ServiceError
  | Server.VerisureSessionStoreError
  | VerisureSafeUpstreamError;

export interface ShortcutRestErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export interface SafeShortcutHttpError {
  readonly body: ShortcutRestErrorBody;
  readonly status: number;
}

const ShortcutRestErrorBodySchema = <Code extends string>(
  code: Code,
  status: number
) =>
  Schema.Struct({
    error: Schema.Struct({
      code: Schema.Literal(code),
      message: Schema.String,
    }),
  }).pipe(HttpApiSchema.status(status));

export const ShortcutUnauthorizedError = ShortcutRestErrorBodySchema(
  "unauthorized",
  401
);
export const ShortcutForbiddenError = ShortcutRestErrorBodySchema(
  "forbidden",
  403
);
export const ShortcutInvalidInputError = ShortcutRestErrorBodySchema(
  "invalid_input",
  400
);
export const ShortcutCredentialNotFoundError = ShortcutRestErrorBodySchema(
  "credential_not_found",
  404
);
export const ShortcutInstallationNotFoundError = ShortcutRestErrorBodySchema(
  "installation_not_found",
  404
);
export const ShortcutAuthenticationUpstreamError = ShortcutRestErrorBodySchema(
  "authentication_error",
  401
);
export const ShortcutCredentialsRejectedUpstreamError =
  ShortcutRestErrorBodySchema("credentials_rejected", 401);
export const ShortcutMfaRequiredUpstreamError = ShortcutRestErrorBodySchema(
  "mfa_required",
  409
);
export const ShortcutRateLimitUpstreamError = ShortcutRestErrorBodySchema(
  "rate_limit_error",
  429
);
export const ShortcutCookieReadUpstreamError = ShortcutRestErrorBodySchema(
  "cookie_read_error",
  502
);
export const ShortcutGraphQlUpstreamError = ShortcutRestErrorBodySchema(
  "graph_q_l_error",
  502
);
export const ShortcutLoginUpstreamError = ShortcutRestErrorBodySchema(
  "login_error",
  502
);
export const ShortcutLogoutUpstreamError = ShortcutRestErrorBodySchema(
  "logout_error",
  502
);
export const ShortcutRequestUpstreamError = ShortcutRestErrorBodySchema(
  "request_error",
  502
);
export const ShortcutResponseUpstreamError = ShortcutRestErrorBodySchema(
  "response_error",
  502
);
export const ShortcutServiceUnavailableError = ShortcutRestErrorBodySchema(
  "service_unavailable",
  503
);

export const ShortcutRestErrorSchemas = [
  ShortcutUnauthorizedError,
  ShortcutForbiddenError,
  ShortcutInvalidInputError,
  ShortcutCredentialNotFoundError,
  ShortcutInstallationNotFoundError,
  ShortcutAuthenticationUpstreamError,
  ShortcutCredentialsRejectedUpstreamError,
  ShortcutMfaRequiredUpstreamError,
  ShortcutRateLimitUpstreamError,
  ShortcutCookieReadUpstreamError,
  ShortcutGraphQlUpstreamError,
  ShortcutLoginUpstreamError,
  ShortcutLogoutUpstreamError,
  ShortcutRequestUpstreamError,
  ShortcutResponseUpstreamError,
  ShortcutServiceUnavailableError,
] as const;

export type ShortcutRestError = Schema.Schema.Type<
  (typeof ShortcutRestErrorSchemas)[number]
>;

export const shortcutRestError = (
  status: number,
  code: string,
  message: string
): SafeShortcutHttpError => ({
  body: { error: { code, message } },
  status,
});

export const invalidInput = (
  message = "Invalid request payload"
): SafeShortcutHttpError => shortcutRestError(400, "invalid_input", message);

export const notFound = (message = "Not Found"): SafeShortcutHttpError =>
  shortcutRestError(404, "not_found", message);

export const serviceUnavailable = (
  message = "Service is unavailable"
): SafeShortcutHttpError =>
  shortcutRestError(503, "service_unavailable", message);

export const toShortcutHttpServerResponse = (error: SafeShortcutHttpError) =>
  HttpServerResponse.json(error.body, { status: error.status });

export const applicationErrorToShortcutHttpServerResponse = (
  error: ShortcutApplicationError
) => toShortcutHttpServerResponse(toSafeShortcutHttpError(error));

export const toSafeShortcutHttpError = (
  error: ShortcutApplicationError
): SafeShortcutHttpError => {
  if (error instanceof Server.ApiTokenError) {
    if (
      error.message.includes("missing required scope") ||
      error.message.includes("not allowed to access this installation")
    ) {
      return shortcutRestError(403, "forbidden", error.message);
    }

    return shortcutRestError(401, "unauthorized", error.message);
  }

  if (error instanceof Server.ScopeError) {
    if (error.giid !== undefined) {
      return shortcutRestError(
        404,
        "installation_not_found",
        "Installation not found"
      );
    }
    if (error.credentialId !== undefined) {
      return shortcutRestError(
        404,
        "credential_not_found",
        "Credential not found"
      );
    }
    return shortcutRestError(
      403,
      "forbidden",
      "Request is outside the current scope"
    );
  }

  if (isVerisureUpstreamError(error)) {
    return verisureUpstreamError(error);
  }

  if (error instanceof Server.ServiceError) {
    return shortcutRestError(400, "invalid_input", error.message);
  }

  if (error instanceof Server.CredentialCryptoError) {
    return shortcutRestError(
      400,
      "invalid_input",
      "Credential material is invalid"
    );
  }

  if (
    error instanceof Server.RepositoryError ||
    error instanceof Server.VerisureSessionStoreError
  ) {
    return serviceUnavailable("Service storage is unavailable");
  }

  if (error instanceof PlatformError) {
    return serviceUnavailable("Platform service is unavailable");
  }

  return absurd(error);
};

const verisureUpstreamError = (
  error: VerisureSafeUpstreamError
): SafeShortcutHttpError => {
  let status = 502;
  if (
    error instanceof Domain.AuthenticationError ||
    error instanceof Domain.CredentialsRejected
  ) {
    status = 401;
  }
  if (error instanceof Domain.MFARequired) {
    status = 409;
  }
  if (error instanceof Domain.RateLimitError) {
    status = 429;
  }
  if (
    "statusCode" in error &&
    error.statusCode !== undefined &&
    error.statusCode >= 400 &&
    error.statusCode < 600
  ) {
    status = error.statusCode;
  }

  return shortcutRestError(
    status,
    errorCode(error._tag),
    upstreamMessage(error)
  );
};

const isVerisureUpstreamError = (
  error: ShortcutApplicationError
): error is VerisureSafeUpstreamError =>
  error instanceof Domain.AuthenticationError ||
  error instanceof Domain.CookieReadError ||
  error instanceof Domain.CredentialsRejected ||
  error instanceof Domain.GraphQLError ||
  error instanceof Domain.LoginError ||
  error instanceof Domain.LogoutError ||
  error instanceof Domain.MFARequired ||
  error instanceof Domain.RateLimitError ||
  error instanceof Domain.RequestError ||
  error instanceof Domain.ResponseError;

const upstreamMessage = (error: VerisureSafeUpstreamError): string => {
  if (error instanceof Domain.ResponseError) {
    return "Verisure returned an invalid response";
  }
  if (error instanceof Domain.GraphQLError) {
    return "Verisure GraphQL request failed";
  }
  if (error instanceof Domain.CookieReadError) {
    return "Failed to read Verisure session cookies";
  }
  if (error instanceof Domain.RequestError) {
    return "Failed to reach Verisure";
  }
  return error.message;
};

const ErrorCodes: Record<VerisureSafeUpstreamError["_tag"], string> = {
  AuthenticationError: "authentication_error",
  CookieReadError: "cookie_read_error",
  CredentialsRejected: "credentials_rejected",
  GraphQLError: "graph_q_l_error",
  LoginError: "login_error",
  LogoutError: "logout_error",
  MFARequired: "mfa_required",
  RateLimitError: "rate_limit_error",
  RequestError: "request_error",
  ResponseError: "response_error",
};

const errorCode = (tag: VerisureSafeUpstreamError["_tag"]): string =>
  ErrorCodes[tag];

const absurd = (value: never): never => {
  throw new Error(`Unexpected unmapped Shortcut REST error: ${String(value)}`);
};
