import * as Domain from "@verisure/domain";
import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import { PlatformError } from "effect/PlatformError";

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
