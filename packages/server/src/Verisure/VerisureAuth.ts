import {
  AuthenticationError,
  CookieReadError,
  LoginError,
  MFARequired,
  RateLimitError,
  RequestError,
  ResponseError,
} from "@verisure/domain";
import type { ConnectionStatus, VerisureDomainError } from "@verisure/domain";
import {
  mergeCookies,
  parseSetCookieHeaders,
  serializeCookieHeader,
  splitCombinedSetCookieHeader,
} from "@verisure/shared/cookies";
import type { Cookie } from "@verisure/shared/cookies";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpHeaders from "effect/unstable/http/Headers";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { CredentialRepository } from "../Repositories/CredentialRepository";
import type { RepositoryError } from "../Repositories/RepositoryError";
import { CredentialCrypto } from "../Security/CredentialCrypto";
import type { CredentialCryptoError } from "../Security/CredentialCrypto";
import { CurrentCredential } from "../Security/RequestContext";
import { fetchAllInstallationsOperation } from "./FetchAllInstallationsOperation";
import { VerisureSessionStore } from "./VerisureSessionStore";
import type {
  SessionCookie,
  SessionSnapshot,
  VerisureSessionStoreError,
} from "./VerisureSessionStore";
import { VerisureTransport } from "./VerisureTransport";

const SessionTtlMs = 14 * 60 * 1000;
const ValidSessionSkewMs = 15 * 1000;
const MfaTypes = ["phone", "email"] as const;
const RefreshCookieNames = new Set(["vid", "vs-refresh"]);

export type VerisureAuthError =
  | VerisureDomainError
  | CredentialCryptoError
  | RepositoryError
  | VerisureSessionStoreError;

export interface VerisureAuthShape {
  readonly ensureSession: Effect.Effect<
    SessionSnapshot,
    VerisureAuthError,
    CurrentCredential
  >;
  readonly login: Effect.Effect<
    SessionSnapshot,
    VerisureAuthError,
    CurrentCredential
  >;
  readonly requestMfa: Effect.Effect<
    void,
    VerisureAuthError,
    CurrentCredential
  >;
  readonly validateMfa: (
    token: string
  ) => Effect.Effect<SessionSnapshot, VerisureAuthError, CurrentCredential>;
  readonly logout: Effect.Effect<void, VerisureAuthError, CurrentCredential>;
}

export class VerisureAuth extends Context.Service<
  VerisureAuth,
  VerisureAuthShape
>()("@verisure/server/VerisureAuth") {
  static readonly Live = Layer.effect(
    VerisureAuth,
    Effect.gen(function* () {
      const crypto = yield* CredentialCrypto;
      const credentials = yield* CredentialRepository;
      const sessions = yield* VerisureSessionStore;
      const transport = yield* VerisureTransport;

      const setStatus = Effect.fn("VerisureAuth.setStatus")(function* (
        status: ConnectionStatus,
        message?: string | null,
        extra?: {
          readonly connectedAt?: Date | null;
          readonly mfaRequestedAt?: Date | null;
        }
      ) {
        const credential = yield* CurrentCredential;
        const now = new Date();
        yield* credentials.setConnectionStatus({
          attemptedAt: now,
          connectedAt: extra?.connectedAt,
          id: credential.id,
          message,
          mfaRequestedAt: extra?.mfaRequestedAt,
          now,
          status,
          userId: credential.userId,
        });
      });

      const decryptedCredential = Effect.gen(function* () {
        const credential = yield* CurrentCredential;
        return yield* crypto.decryptCredential(credential);
      }).pipe(Effect.withSpan("VerisureAuth.decryptedCredential"));

      const { preferredBaseUrl } = transport;

      const makeSnapshot = (
        input: {
          readonly cookies: readonly SessionCookie[];
          readonly trustToken?: SessionSnapshot["trustToken"];
        },
        now = Date.now()
      ): Effect.Effect<SessionSnapshot, never> => {
        const { cookies, trustToken } = input;
        return preferredBaseUrl.pipe(
          Effect.map((baseUrl) => ({
            authenticatedAt: now,
            cookies,
            expiresAt: now + SessionTtlMs,
            preferredBaseUrl: baseUrl,
            ...(trustToken === undefined ? {} : { trustToken }),
          }))
        );
      };

      const saveConnectedSnapshot = Effect.fn(
        "VerisureAuth.saveConnectedSnapshot"
      )(function* (snapshot: SessionSnapshot) {
        yield* sessions.putSnapshot(snapshot);
        yield* sessions.clearMfaState;
        yield* setStatus("connected", null, {
          connectedAt: new Date(snapshot.authenticatedAt),
          mfaRequestedAt: null,
        });
        return snapshot;
      });

      const loginRequest = (
        email: Redacted.Redacted,
        password: Redacted.Redacted,
        cookies: readonly SessionCookie[] = []
      ) =>
        transport.request(
          HttpClientRequest.post("/auth/login", {
            headers: cookieHeader(cookies),
          }).pipe(HttpClientRequest.basicAuth(email, password))
        );

      const verifySession = Effect.fn("VerisureAuth.verifySession")(function* (
        email: string,
        cookies: readonly SessionCookie[]
      ) {
        const operation = yield* fetchAllInstallationsOperation({
          email,
        }).pipe(Effect.mapError(graphQLOperationInputError));
        yield* transport.executeGraphQL({
          cookies,
          operation,
        });
      });

      const loginWithBasicAuth = Effect.fn("VerisureAuth.loginWithBasicAuth")(
        function* () {
          const decrypted = yield* decryptedCredential;
          const response = yield* loginRequest(
            decrypted.email,
            decrypted.password
          );
          const text = yield* responseText(response);
          const cookies = yield* responseCookies(response);

          if (text.includes("stepUpToken")) {
            yield* sessions.putMfaState({ cookies, requestedAt: Date.now() });
            const requestedAt = new Date();
            yield* setStatus(
              "mfa_required",
              "Verisure requires multifactor authentication",
              { mfaRequestedAt: requestedAt }
            );
            return yield* new MFARequired({
              message: "Verisure requires multifactor authentication",
              statusCode: response.status,
            });
          }

          yield* verifySession(Redacted.value(decrypted.email), cookies);
          const snapshot = yield* makeSnapshot({ cookies });
          return yield* saveConnectedSnapshot(snapshot);
        }
      );

      const refreshSession = Effect.fn("VerisureAuth.refreshSession")(
        function* (snapshot: SessionSnapshot) {
          const refreshCookies = snapshot.cookies.filter((cookie) =>
            RefreshCookieNames.has(cookie.name)
          );
          if (refreshCookies.length === 0) {
            return yield* new CookieReadError({
              message: "Verisure session snapshot has no refresh cookies",
            });
          }

          const response = yield* transport.request(
            HttpClientRequest.get("/auth/token", {
              headers: cookieHeader(refreshCookies),
            })
          );
          const incoming = yield* responseCookies(response);
          const cookies = mergeSessionCookies(snapshot.cookies, incoming);
          const refreshed = yield* makeSnapshot(
            { cookies, trustToken: snapshot.trustToken },
            Date.now()
          );
          return yield* saveConnectedSnapshot(refreshed);
        }
      );

      const loginWithTrustCookie = Effect.fn(
        "VerisureAuth.loginWithTrustCookie"
      )(function* (snapshot: SessionSnapshot) {
        const trustCookies = snapshot.cookies.filter((cookie) =>
          cookie.name.includes("vs-trust")
        );
        if (trustCookies.length === 0) {
          return yield* new CookieReadError({
            message: "Verisure session snapshot has no trust cookie",
          });
        }

        const decrypted = yield* decryptedCredential;
        const response = yield* loginRequest(
          decrypted.email,
          decrypted.password,
          trustCookies
        );
        const text = yield* responseText(response);
        if (text.includes("stepUpToken")) {
          return yield* new MFARequired({
            message: "Verisure requires multifactor authentication",
            statusCode: response.status,
          });
        }
        const cookies = mergeSessionCookies(
          snapshot.cookies,
          yield* responseCookies(response)
        );
        yield* verifySession(Redacted.value(decrypted.email), cookies);
        const next = yield* makeSnapshot({
          cookies,
          trustToken: snapshot.trustToken,
        });
        return yield* saveConnectedSnapshot(next);
      });

      const recoverTrustLoginFailure = (trustError: VerisureAuthError) => {
        if (!canTryBasicLogin(trustError)) {
          return Effect.fail(trustError);
        }
        return loginWithBasicAuth();
      };

      const recoverRefreshFailure = (
        snapshot: SessionSnapshot,
        refreshError: VerisureAuthError
      ) => {
        if (!canTryTrustLogin(refreshError)) {
          return Effect.fail(refreshError);
        }

        return loginWithTrustCookie(snapshot).pipe(
          // oxlint-disable-next-line promise/prefer-await-to-then -- Effect.catch is the Effect 4 recovery combinator, not Promise.prototype.catch.
          Effect.catch(recoverTrustLoginFailure)
        );
      };

      const recoverExpiredSnapshot = Effect.fn(
        "VerisureAuth.recoverExpiredSnapshot"
      )(function* (snapshot: SessionSnapshot) {
        return yield* refreshSession(snapshot).pipe(
          Effect.catch((refreshError) =>
            recoverRefreshFailure(snapshot, refreshError)
          )
        );
      });

      const currentValidSnapshot = Effect.gen(function* () {
        const snapshot = yield* sessions.getSnapshot;
        if (Option.isSome(snapshot) && isSnapshotValid(snapshot.value)) {
          return Option.some(snapshot.value);
        }
        return Option.none<SessionSnapshot>();
      }).pipe(Effect.withSpan("VerisureAuth.currentValidSnapshot"));

      const updateStatusAfterError = (error: VerisureAuthError) =>
        updateStatusForError(error, setStatus).pipe(Effect.ignore);

      const withStatusUpdates = Effect.fn("VerisureAuth.withStatusUpdates")(
        <A, E extends VerisureAuthError, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(Effect.tapError(updateStatusAfterError))
      );

      const ensureSession = Effect.gen(function* () {
        const valid = yield* currentValidSnapshot;
        if (Option.isSome(valid)) {
          return valid.value;
        }

        const snapshot = yield* sessions.getSnapshot;
        if (Option.isSome(snapshot)) {
          return yield* recoverExpiredSnapshot(snapshot.value);
        }

        return yield* loginWithBasicAuth();
      }).pipe(
        Effect.withSpan("VerisureAuth.ensureSession"),
        withStatusUpdates,
        sessions.withCredentialLock
      );

      const requestMfa = Effect.gen(function* () {
        const decrypted = yield* decryptedCredential;
        const response = yield* loginRequest(
          decrypted.email,
          decrypted.password
        );
        const text = yield* responseText(response);
        const loginCookies = yield* responseCookies(response);
        if (!text.includes("stepUpToken")) {
          return yield* new LoginError({
            message:
              "Multifactor authentication is not enabled for this credential",
            statusCode: response.status,
          });
        }

        const requestMfaCode = Effect.fn("VerisureAuth.requestMfaCode")(
          (mfaType: (typeof MfaTypes)[number]) =>
            transport.request(
              HttpClientRequest.post(`/auth/mfa?type=${mfaType}`, {
                headers: cookieHeader(loginCookies),
              })
            )
        );

        const mfaResponse = yield* Effect.firstSuccessOf(
          MfaTypes.map((mfaType) => requestMfaCode(mfaType))
        );
        const cookies = mergeSessionCookies(
          loginCookies,
          yield* responseCookies(mfaResponse)
        );
        const requestedAt = Date.now();
        yield* sessions.putMfaState({ cookies, requestedAt });
        yield* setStatus("mfa_required", "Verisure MFA code requested", {
          mfaRequestedAt: new Date(requestedAt),
        });
      }).pipe(
        Effect.withSpan("VerisureAuth.requestMfa"),
        withStatusUpdates,
        sessions.withCredentialLock
      );

      const validateMfaOperation = Effect.fn("VerisureAuth.validateMfa")(
        function* (token: string) {
          const mfa = yield* sessions.getMfaState;
          if (Option.isNone(mfa)) {
            return yield* new CookieReadError({
              message: "No pending Verisure MFA state found",
            });
          }

          const validateResponse = yield* transport.request(
            HttpClientRequest.post("/auth/mfa/validate", {
              headers: {
                ...cookieHeader(mfa.value.cookies),
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            }).pipe(HttpClientRequest.bodyJsonUnsafe({ token }))
          );
          const validatedCookies = mergeSessionCookies(
            mfa.value.cookies,
            yield* responseCookies(validateResponse)
          );

          const trustResponse = yield* transport.request(
            HttpClientRequest.post("/auth/trust", {
              headers: {
                ...cookieHeader(validatedCookies),
                Accept: "application/json",
              },
            })
          );
          const trustCookies = mergeSessionCookies(
            validatedCookies,
            yield* responseCookies(trustResponse)
          );
          const trustToken = yield* trustTokenFromResponse(trustResponse);
          const decrypted = yield* decryptedCredential;
          yield* verifySession(Redacted.value(decrypted.email), trustCookies);
          const snapshot = yield* makeSnapshot({
            cookies: trustCookies,
            trustToken,
          });
          return yield* saveConnectedSnapshot(snapshot);
        }
      );

      const validateMfa: VerisureAuthShape["validateMfa"] = (token) =>
        validateMfaOperation(token).pipe(
          withStatusUpdates,
          sessions.withCredentialLock
        );

      const clearLogoutState = Effect.gen(function* () {
        yield* sessions.clearSnapshot;
        yield* sessions.clearMfaState;
        yield* setStatus("unchecked", null, {
          connectedAt: null,
          mfaRequestedAt: null,
        });
      }).pipe(Effect.withSpan("VerisureAuth.clearLogoutState"));

      const logout = Effect.gen(function* () {
        const snapshot = yield* sessions.getSnapshot;
        if (Option.isSome(snapshot)) {
          if (snapshot.value.trustToken !== undefined) {
            yield* transport.request(
              HttpClientRequest.delete(
                `/auth/trust/${snapshot.value.trustToken.trustTokenValue}`,
                {
                  headers: {
                    ...cookieHeader(snapshot.value.cookies),
                    Accept: "application/json",
                  },
                }
              )
            );
          }
          yield* transport.request(
            HttpClientRequest.delete("/auth/logout", {
              headers: cookieHeader(snapshot.value.cookies),
            })
          );
        }
      }).pipe(
        Effect.withSpan("VerisureAuth.logout"),
        Effect.ensuring(
          clearLogoutState.pipe(
            Effect.ignore({
              log: true,
              message: "Failed to clear Verisure logout state",
            })
          )
        ),
        sessions.withCredentialLock
      );

      return VerisureAuth.of({
        ensureSession,
        login: loginWithBasicAuth().pipe(sessions.withCredentialLock),
        logout,
        requestMfa,
        validateMfa,
      });
    })
  );
}

const isSnapshotValid = (snapshot: SessionSnapshot, now = Date.now()) =>
  snapshot.expiresAt > now + ValidSessionSkewMs;

const responseText = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<string, RequestError> =>
  response.text.pipe(
    Effect.mapError(
      (cause) =>
        new RequestError({
          cause,
          message: "Failed to read Verisure response body",
        })
    )
  );

const responseJson = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<unknown, RequestError | ResponseError> =>
  Effect.gen(function* () {
    const text = yield* responseText(response);
    return yield* Effect.try({
      catch: () =>
        new ResponseError({
          message: "Failed to parse Verisure JSON response",
          statusCode: response.status,
          text,
        }),
      try: () => (text.length === 0 ? null : JSON.parse(text)),
    });
  });

const responseCookies = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<readonly SessionCookie[], CookieReadError> =>
  Effect.try({
    catch: (cause) =>
      new CookieReadError({
        cause,
        message: "Failed to read Verisure response cookies",
      }),
    try: () => {
      const setCookie = Option.getOrUndefined(
        HttpHeaders.get(response.headers, "set-cookie")
      );
      if (setCookie === undefined || setCookie.length === 0) {
        return [];
      }
      return parseSetCookieHeaders(splitCombinedSetCookieHeader(setCookie)).map(
        cookieToSessionCookie
      );
    },
  });

const trustTokenFromResponse = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<SessionSnapshot["trustToken"], RequestError | ResponseError> =>
  responseJson(response).pipe(
    Effect.flatMap((body) =>
      Schema.decodeUnknownEffect(TrustTokenResponse)(body).pipe(
        Effect.mapError(
          () =>
            new ResponseError({
              message: "Verisure trust response did not contain a trust token",
              statusCode: response.status,
              text: JSON.stringify(body),
            })
        )
      )
    )
  );

const TrustTokenResponse = Schema.Struct({
  expiresAt: Schema.optionalKey(Schema.Finite),
  trustTokenValue: Schema.String,
});

const graphQLOperationInputError = (cause: Schema.SchemaError) =>
  new ResponseError({
    message: "Failed to build Verisure GraphQL request",
    statusCode: 0,
    text: cause.message,
  });

const cookieHeader = (cookies: readonly SessionCookie[]) =>
  cookies.length === 0 ? {} : { Cookie: serializeCookieHeader(cookies) };

const mergeSessionCookies = (
  current: readonly SessionCookie[],
  incoming: readonly SessionCookie[]
): readonly SessionCookie[] =>
  mergeCookies(
    current.map(sessionCookieToCookie),
    incoming.map(sessionCookieToCookie)
  ).map(cookieToSessionCookie);

const sessionCookieToCookie = (cookie: SessionCookie): Cookie => {
  const { expires, ...rest } = cookie;
  return {
    ...rest,
    ...(expires === undefined ? {} : { expires: new Date(expires) }),
  };
};

const cookieToSessionCookie = (cookie: Cookie): SessionCookie => {
  const { expires, ...rest } = cookie;
  return {
    ...rest,
    ...(expires === undefined ? {} : { expires: expires.getTime() }),
  };
};

const canTryTrustLogin = (error: VerisureAuthError): boolean =>
  error instanceof AuthenticationError || error instanceof CookieReadError;

const canTryBasicLogin = (error: VerisureAuthError): boolean =>
  error instanceof AuthenticationError || error instanceof CookieReadError;

const updateStatusForError = (
  error: VerisureAuthError,
  setStatus: (
    status: ConnectionStatus,
    message?: string | null,
    extra?: {
      readonly connectedAt?: Date | null;
      readonly mfaRequestedAt?: Date | null;
    }
  ) => Effect.Effect<void, RepositoryError, CurrentCredential>
) => {
  if (error instanceof MFARequired) {
    return setStatus("mfa_required", error.message, {
      mfaRequestedAt: new Date(),
    });
  }
  if (error instanceof AuthenticationError) {
    return setStatus("auth_failed", error.message, { connectedAt: null });
  }
  if (error instanceof RateLimitError) {
    return setStatus("rate_limited", error.message);
  }
  if (error instanceof LoginError) {
    return setStatus("auth_failed", error.message, { connectedAt: null });
  }
  return setStatus("error", "Verisure session operation failed");
};
