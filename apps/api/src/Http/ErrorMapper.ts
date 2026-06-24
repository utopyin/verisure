import * as Domain from "@verisure/domain";
import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import { PlatformError } from "effect/PlatformError";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

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

export type ApplicationError =
  | PlatformError
  | Server.ApiTokenError
  | Server.CredentialCryptoError
  | Server.RepositoryError
  | Server.ScopeError
  | Server.ServiceError
  | Server.VerisureSessionStoreError
  | VerisureSafeUpstreamError;

export interface RestErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export interface SafeHttpError {
  readonly status: number;
  readonly body: RestErrorBody;
}

export const toDashboardRpcError = (
  error: ApplicationError
): RpcContract.DashboardRpcError => {
  if (error instanceof Server.ScopeError) {
    if (error.giid !== undefined) {
      return new RpcContract.InstallationNotFound({
        giid: error.giid,
        message: "Installation not found",
      });
    }
    if (error.credentialId !== undefined) {
      return new RpcContract.CredentialNotFound({
        credentialId: error.credentialId,
        message: "Credential not found",
      });
    }
    return new RpcContract.Forbidden({
      message: "Request is outside the current scope",
    });
  }

  if (isVerisureUpstreamError(error)) {
    return new RpcContract.VerisureUpstreamError({
      kind: error._tag,
      message: upstreamMessage(error),
      ...optionalStatusCode(error),
    });
  }

  if (
    error instanceof Server.ServiceError ||
    error instanceof Server.ApiTokenError
  ) {
    return new RpcContract.InvalidInput({ message: error.message });
  }

  if (error instanceof Server.CredentialCryptoError) {
    return new RpcContract.InvalidInput({
      message: "Credential material is invalid",
    });
  }

  if (
    error instanceof Server.RepositoryError ||
    error instanceof Server.VerisureSessionStoreError
  ) {
    return new RpcContract.VerisureUpstreamError({
      kind: "RequestError",
      message: "Service storage is unavailable",
    });
  }

  if (error instanceof PlatformError) {
    return new RpcContract.VerisureUpstreamError({
      kind: "RequestError",
      message: "Platform service is unavailable",
    });
  }

  return absurd(error);
};

export const toSafeHttpError = (
  error: RpcContract.DashboardRpcError
): SafeHttpError => {
  switch (error._tag) {
    case "Unauthorized": {
      return restError(401, "unauthorized", error.message);
    }
    case "Forbidden": {
      return restError(403, "forbidden", error.message);
    }
    case "CredentialNotFound": {
      return restError(404, "credential_not_found", error.message);
    }
    case "InstallationNotFound": {
      return restError(404, "installation_not_found", error.message);
    }
    case "InvalidInput": {
      return restError(400, "invalid_input", error.message);
    }
    case "VerisureUpstreamError": {
      let kind = 502;
      if (
        error.kind === "AuthenticationError" ||
        error.kind === "CredentialsRejected"
      ) {
        kind = 401;
      }
      if (error.kind === "MFARequired") {
        kind = 409;
      }
      if (error.kind === "RateLimitError") {
        kind = 429;
      }
      if (
        error.statusCode !== undefined &&
        error.statusCode >= 400 &&
        error.statusCode < 600
      ) {
        kind = error.statusCode;
      }

      return restError(
        kind,
        error.kind.replaceAll(/[A-Z]/gu, (letter, index) =>
          index === 0 ? letter.toLowerCase() : `_${letter.toLowerCase()}`
        ),
        error.message
      );
    }
    default: {
      return absurd(error);
    }
  }
};

export const toHttpServerResponse = (error: RpcContract.DashboardRpcError) => {
  const mapped = toSafeHttpError(error);
  return HttpServerResponse.json(mapped.body, { status: mapped.status });
};

export const applicationErrorToHttpServerResponse = (error: ApplicationError) =>
  toHttpServerResponse(toDashboardRpcError(error));

export const unauthorized = (
  message = "Unauthorized"
): RpcContract.DashboardRpcError => new RpcContract.Unauthorized({ message });

const restError = (
  status: number,
  code: string,
  message: string
): SafeHttpError => ({
  body: { error: { code, message } },
  status,
});

const isVerisureUpstreamError = (
  error: ApplicationError
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

const optionalStatusCode = (error: VerisureSafeUpstreamError) =>
  "statusCode" in error && error.statusCode !== undefined
    ? { statusCode: error.statusCode }
    : {};

const absurd = (value: never): never => {
  throw new Error(`Unexpected unmapped error: ${String(value)}`);
};
