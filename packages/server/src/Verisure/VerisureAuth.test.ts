import { it, describe, expect } from "@effect/vitest";
import type { VerisureCredentialRow } from "@verisure/db/schema";
import {
  AuthenticationError,
  GraphQLError,
  RequestError,
  ResponseError,
  classifyGraphQLResponse,
} from "@verisure/domain";
import type { ConnectionStatus } from "@verisure/domain";
import { serializeCookieHeader } from "@verisure/shared/cookies";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as HttpHeaders from "effect/unstable/http/Headers";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { CredentialRepository } from "../Repositories/CredentialRepository.ts";
import { RepositoryError } from "../Repositories/RepositoryError.ts";
import { CredentialCrypto } from "../Security/CredentialCrypto.ts";
import { CurrentCredential } from "../Security/RequestContext.ts";
import { VerisureAuth } from "./VerisureAuth.ts";
import { VerisureRequests } from "./VerisureRequests.ts";
import { VerisureSessionStore } from "./VerisureSessionStore.ts";
import type { SessionSnapshot } from "./VerisureSessionStore.ts";
import { VerisureTransport } from "./VerisureTransport.ts";

const credential = {
  alias: "Home",
  connectedAt: null,
  connectionStatus: "unchecked",
  connectionStatusMessage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  defaultGiid: null,
  encryptedEmail: "encrypted-email",
  encryptedPassword: "encrypted-password",
  encryptedPin: null,
  id: "credential-1",
  lastConnectionAttemptAt: null,
  mfaRequestedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  userId: "user-1",
} satisfies VerisureCredentialRow;

describe(VerisureAuth, () => {
  it.effect(
    "logs in with basic auth, verifies installations, and stores a snapshot",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness([
          response("{}", "vid=one; Path=/, vs-refresh=refresh; Path=/"),
          response('[{"data":{"account":{"installations":[]}}}]'),
        ]);

        const snapshot = yield* Effect.gen(function* () {
          const auth = yield* VerisureAuth;
          return yield* auth.ensureSession;
        }).pipe(harness.provide);

        expect(harness.calls.map((call) => call.url)).toStrictEqual([
          "/auth/login",
          "/graphql",
        ]);
        expect(
          Option.getOrThrow(
            HttpHeaders.get(
              harness.calls[0]?.headers ?? HttpHeaders.empty,
              "authorization"
            )
          )
        ).toBe(`Basic ${btoa("user@example.com:secret")}`);
        expect(snapshot.cookies.map((cookie) => cookie.name)).toStrictEqual([
          "vid",
          "vs-refresh",
        ]);
        expect(harness.statuses.at(-1)?.status).toBe("connected");
      })
  );

  it.effect("requests MFA and stores temporary MFA cookies separately", () =>
    Effect.gen(function* () {
      const harness = makeHarness([
        response(
          '{"stepUpToken":"step-up"}',
          "step=one; Path=/, vid=pending; Path=/"
        ),
        response("{}", "mfa=two; Path=/"),
      ]);

      const result = yield* Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* auth.requestMfa;
        const mfa = yield* store.getMfaState;
        const snapshot = yield* store.getSnapshot;
        return { mfa, snapshot };
      }).pipe(harness.provide);

      expect(harness.calls.map((call) => call.url)).toStrictEqual([
        "/auth/login",
        "/auth/mfa?type=phone",
      ]);
      expect(result.snapshot._tag).toBe("None");
      expect(
        Option.getOrThrow(result.mfa).cookies.map((cookie) => cookie.name)
      ).toStrictEqual(["step", "vid", "mfa"]);
      expect(harness.statuses.at(-1)?.status).toBe("mfa_required");
    })
  );

  it.effect(
    "validates MFA, stores trust token, and clears temporary MFA state",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness([
          response(
            "{}",
            "vid=authenticated; Path=/, vs-refresh=refresh; Path=/"
          ),
          response(
            '{"trustTokenValue":"trust-token"}',
            "vs-trust=trusted; Path=/"
          ),
          response('[{"data":{"account":{"installations":[]}}}]'),
        ]);

        const result = yield* Effect.gen(function* () {
          const auth = yield* VerisureAuth;
          const store = yield* VerisureSessionStore;
          yield* store.putMfaState({
            cookies: [{ name: "step", value: "one" }],
            requestedAt: Date.now(),
          });
          const snapshot = yield* auth.validateMfa("123456");
          const mfa = yield* store.getMfaState;
          return { mfa, snapshot };
        }).pipe(harness.provide);

        expect(harness.calls.map((call) => call.url)).toStrictEqual([
          "/auth/mfa/validate",
          "/auth/trust",
          "/graphql",
        ]);
        expect(result.snapshot.trustToken?.trustTokenValue).toBe("trust-token");
        expect(result.snapshot.cookies.map((cookie) => cookie.name)).toContain(
          "vs-trust"
        );
        expect(result.mfa._tag).toBe("None");
        expect(harness.statuses.at(-1)?.status).toBe("connected");
      })
  );

  it.effect("refreshes expired snapshots with refresh cookies", () =>
    Effect.gen(function* () {
      const harness = makeHarness([
        response("{}", "vid=new; Path=/, vs-refresh=new-refresh; Path=/"),
      ]);

      const snapshot = yield* Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot(expiredSnapshot);
        return yield* auth.ensureSession;
      }).pipe(harness.provide);

      expect(harness.calls.map((call) => call.url)).toStrictEqual([
        "/auth/token",
      ]);
      expect(snapshot.cookies).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "vid", value: "new" }),
          expect.objectContaining({ name: "vs-refresh", value: "new-refresh" }),
        ])
      );
    })
  );

  it.effect("falls back to basic login when refresh authentication fails", () =>
    Effect.gen(function* () {
      const harness = makeHarness([
        new AuthenticationError({ message: "expired", statusCode: 401 }),
        response("{}", "vid=one; Path=/, vs-refresh=refresh; Path=/"),
        response('[{"data":{"account":{"installations":[]}}}]'),
      ]);

      const snapshot = yield* Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot(expiredSnapshot);
        return yield* auth.ensureSession;
      }).pipe(harness.provide);

      expect(harness.calls.map((call) => call.url)).toStrictEqual([
        "/auth/token",
        "/auth/login",
        "/graphql",
      ]);
      expect(snapshot.cookies.map((cookie) => cookie.name)).toStrictEqual([
        "vid",
        "vs-refresh",
      ]);
    })
  );

  it.effect(
    "falls back to trust-cookie login when refresh cookies are unavailable",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness([
          response(
            "{}",
            "vid=trusted-session; Path=/, vs-refresh=refresh; Path=/"
          ),
          response('[{"data":{"account":{"installations":[]}}}]'),
        ]);

        const snapshot = yield* Effect.gen(function* () {
          const auth = yield* VerisureAuth;
          const store = yield* VerisureSessionStore;
          yield* store.putSnapshot({
            ...expiredSnapshot,
            cookies: [{ name: "vs-trust", value: "trusted" }],
            trustToken: { trustTokenValue: "trust-token" },
          });
          return yield* auth.ensureSession;
        }).pipe(harness.provide);

        expect(harness.calls.map((call) => call.url)).toStrictEqual([
          "/auth/login",
          "/graphql",
        ]);
        expect(harness.calls[0]?.headers.cookie).toBe("vs-trust=trusted");
        expect(snapshot.cookies.map((cookie) => cookie.name)).toStrictEqual([
          "vs-trust",
          "vid",
          "vs-refresh",
        ]);
      })
  );

  it.effect("logs out and clears stored session state", () =>
    Effect.gen(function* () {
      const harness = makeHarness([response("{}"), response("{}")]);

      const result = yield* Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot({
          ...expiredSnapshot,
          trustToken: { trustTokenValue: "trust-token" },
        });
        yield* auth.logout;
        return yield* store.getSnapshot;
      }).pipe(harness.provide);

      expect(harness.calls.map((call) => call.url)).toStrictEqual([
        "/auth/trust/trust-token",
        "/auth/logout",
      ]);
      expect(result._tag).toBe("None");
      expect(harness.statuses.at(-1)?.status).toBe("unchecked");
    })
  );
});

describe(VerisureRequests, () => {
  it.effect("uses ensured session cookies and maps GraphQL errors", () =>
    Effect.gen(function* () {
      const harness = makeHarness([
        response('[{"errors":[{"message":"boom"}]}]'),
      ]);

      const error = yield* Effect.gen(function* () {
        const requests = yield* VerisureRequests;
        return yield* Effect.flip(requests.armState({ giid: "GIID" }));
      }).pipe(harness.provideRequestsWithSnapshot(expiredSnapshot));

      expect(error).toBeInstanceOf(GraphQLError);
      expect(harness.calls[0]?.headers.cookie).toContain("vid=old");
    })
  );
});

const expiredSnapshot = {
  authenticatedAt: 1,
  cookies: [
    { name: "vid", value: "old" },
    { name: "vs-refresh", value: "refresh" },
  ],
  expiresAt: 1,
  preferredBaseUrl: "https://automation01.test",
} satisfies SessionSnapshot;

const response = (body: string, setCookie?: string) =>
  new Response(body, {
    headers: setCookie === undefined ? {} : { "set-cookie": setCookie },
    status: 200,
  });

const makeHarness = (
  responses: readonly (Response | AuthenticationError | RequestError)[]
) => {
  const queue = [...responses];
  const calls: {
    readonly url: string;
    readonly headers: HttpHeaders.Headers;
  }[] = [];
  const statuses: {
    readonly status: ConnectionStatus;
    readonly message?: string | null;
  }[] = [];

  const request = (request: HttpClientRequest.HttpClientRequest) =>
    Effect.gen(function* () {
      calls.push({ headers: request.headers, url: request.url });
      const next = queue.shift();
      if (next === undefined) {
        return yield* new RequestError({
          message: `Unexpected Verisure request: ${request.url}`,
        });
      }
      if (next instanceof Response) {
        return HttpClientResponse.fromWeb(request, next);
      }
      return yield* next;
    });

  const transport = Layer.succeed(
    VerisureTransport,
    VerisureTransport.of({
      executeGraphQL: (input) =>
        Effect.gen(function* () {
          const response = yield* request(
            HttpClientRequest.post("/graphql", {
              headers: {
                Accept: "application/json",
                ...(input.cookies.length === 0
                  ? {}
                  : { Cookie: serializeCookieHeader(input.cookies) }),
              },
            }).pipe(HttpClientRequest.bodyJsonUnsafe([input.operation.request]))
          );
          const text = yield* response.text.pipe(
            Effect.mapError(
              (cause) =>
                new RequestError({
                  cause,
                  message: "Failed to read Verisure GraphQL response body",
                })
            )
          );
          const body = yield* Effect.try({
            catch: () =>
              new ResponseError({
                message: "Failed to parse Verisure GraphQL response",
                statusCode: response.status,
                text,
              }),
            try: () => (text.length === 0 ? null : JSON.parse(text)),
          });
          const topLevelError = classifyGraphQLResponse(
            body,
            input.operation.operationName
          );
          if (topLevelError !== undefined) {
            return yield* topLevelError;
          }
          if (Array.isArray(body)) {
            for (const item of body) {
              const error = classifyGraphQLResponse(
                item,
                input.operation.operationName
              );
              if (error !== undefined) {
                return yield* error;
              }
            }
          }
          return yield* input.operation.decode(body).pipe(
            Effect.mapError(
              (cause) =>
                new ResponseError({
                  message: "Failed to decode Verisure GraphQL response",
                  statusCode: response.status,
                  text: cause.message,
                })
            )
          );
        }),
      preferredBaseUrl: Effect.succeed("https://automation01.test"),
      request,
    })
  );

  const crypto = Layer.succeed(
    CredentialCrypto,
    CredentialCrypto.of({
      decryptCredential: (row) =>
        Effect.succeed({
          email: Redacted.make("user@example.com"),
          id: row.id,
          password: Redacted.make("secret"),
          userId: row.userId,
        }),
      decryptString: () => Effect.succeed("decrypted"),
      encryptCredential: () =>
        Effect.succeed({
          encryptedEmail: "encrypted-email",
          encryptedPassword: "encrypted-password",
          encryptedPin: null,
        }),
      encryptString: (value) => Effect.succeed(value),
    })
  );

  const notImplemented = Effect.fail(
    new RepositoryError({ cause: "not implemented" })
  );
  const repository = Layer.succeed(
    CredentialRepository,
    CredentialRepository.of({
      create: () => notImplemented,
      delete: () => notImplemented,
      getById: () => notImplemented,
      getOwnedById: () => notImplemented,
      listForUser: () => notImplemented,
      setConnectionStatus: (input) => {
        statuses.push({ message: input.message, status: input.status });
        return Effect.succeed(Option.some(credential));
      },
      setDefaultInstallation: () => notImplemented,
      update: () => notImplemented,
    })
  );

  const baseLayer = Layer.mergeAll(
    VerisureSessionStore.InMemory,
    transport,
    crypto,
    repository,
    Layer.succeed(CurrentCredential, credential)
  );

  const authLayer = VerisureAuth.Live.pipe(Layer.provideMerge(baseLayer));

  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, authLayer);

  const provideRequestsWithSnapshot =
    (snapshot: SessionSnapshot) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(
        effect,
        VerisureRequests.layer.pipe(
          Layer.provideMerge(
            Layer.mergeAll(
              transport,
              Layer.succeed(
                VerisureAuth,
                VerisureAuth.of({
                  ensureSession: Effect.succeed(snapshot),
                  login: Effect.succeed(snapshot),
                  logout: Effect.void,
                  requestMfa: Effect.void,
                  validateMfa: () => Effect.succeed(snapshot),
                })
              ),
              Layer.succeed(CurrentCredential, credential)
            )
          )
        )
      );

  return { calls, provide, provideRequestsWithSnapshot, statuses };
};
