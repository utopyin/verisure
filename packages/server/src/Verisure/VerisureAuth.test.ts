import { describe, expect, it } from "@effect/vitest";
import type { ConnectionStatus } from "@verisure/domain";
import {
  AuthenticationError,
  classifyGraphQLResponse,
  GraphQLError,
  RequestError,
  ResponseError,
} from "@verisure/domain";
import { serializeCookieHeader } from "@verisure/shared/cookies";
import { testCredentialRow } from "@verisure/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpHeaders from "effect/unstable/http/Headers";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { CredentialRepository } from "../Repositories/CredentialRepository";
import { CredentialCrypto } from "../Security/CredentialCrypto";
import { CurrentCredential } from "../Security/RequestContext";
import { VerisureAuth } from "./VerisureAuth";
import { VerisureRequests } from "./VerisureRequests";
import type { SessionMfaState, SessionSnapshot } from "./VerisureSessionStore";
import { VerisureSessionStore } from "./VerisureSessionStore";
import { VerisureTransport } from "./VerisureTransport";

const credential = {
  ...testCredentialRow,
  connectionStatus: "unchecked" as const,
  defaultGiid: null,
};

const ensureSession = Effect.fn("VerisureAuthTest.ensureSession")(function* () {
  const auth = yield* VerisureAuth;
  return yield* auth.ensureSession;
});

const ensureSessionFromSnapshot = Effect.fn(
  "VerisureAuthTest.ensureSessionFromSnapshot"
)(function* (snapshot: SessionSnapshot) {
  const auth = yield* VerisureAuth;
  const store = yield* VerisureSessionStore;
  yield* store.putSnapshot(snapshot);
  return yield* auth.ensureSession;
});

const requestMfaAndReadState = Effect.fn(
  "VerisureAuthTest.requestMfaAndReadState"
)(function* () {
  const auth = yield* VerisureAuth;
  const store = yield* VerisureSessionStore;
  yield* auth.requestMfa;
  const mfa = yield* store.getMfaState;
  const snapshot = yield* store.getSnapshot;
  return { mfa, snapshot };
});

const validateMfaFromStoredState = Effect.fn(
  "VerisureAuthTest.validateMfaFromStoredState"
)(function* (input: {
  readonly mfaState: SessionMfaState;
  readonly token: string;
}) {
  const auth = yield* VerisureAuth;
  const store = yield* VerisureSessionStore;
  yield* store.putMfaState(input.mfaState);
  const snapshot = yield* auth.validateMfa(input.token);
  const mfa = yield* store.getMfaState;
  return { mfa, snapshot };
});

const logoutFromSnapshot = Effect.fn("VerisureAuthTest.logoutFromSnapshot")(
  function* (snapshot: SessionSnapshot) {
    const auth = yield* VerisureAuth;
    const store = yield* VerisureSessionStore;
    yield* store.putSnapshot(snapshot);
    yield* auth.logout;
    return yield* store.getSnapshot;
  }
);

const armStateFailure = Effect.fn("VerisureRequestsTest.armStateFailure")(
  function* (input: { readonly giid: string }) {
    const requests = yield* VerisureRequests;
    return yield* Effect.flip(requests.armState(input));
  }
);

describe(VerisureAuth, () => {
  it.effect(
    "logs in with basic auth, verifies installations, and stores a snapshot",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness([
          response("{}", "vid=one; Path=/, vs-refresh=refresh; Path=/"),
          response('[{"data":{"account":{"installations":[]}}}]'),
        ]);

        const snapshot = yield* ensureSession().pipe(harness.provide);

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

      const result = yield* requestMfaAndReadState().pipe(harness.provide);

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

        const result = yield* validateMfaFromStoredState({
          mfaState: {
            cookies: [{ name: "step", value: "one" }],
            requestedAt: Date.now(),
          },
          token: "123456",
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

      const snapshot = yield* ensureSessionFromSnapshot(expiredSnapshot).pipe(
        harness.provide
      );

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

      const snapshot = yield* ensureSessionFromSnapshot(expiredSnapshot).pipe(
        harness.provide
      );

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

        const snapshot = yield* ensureSessionFromSnapshot({
          ...expiredSnapshot,
          cookies: [{ name: "vs-trust", value: "trusted" }],
          trustToken: { trustTokenValue: "trust-token" },
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

      const result = yield* logoutFromSnapshot({
        ...expiredSnapshot,
        trustToken: { trustTokenValue: "trust-token" },
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

      const error = yield* armStateFailure({ giid: "GIID" }).pipe(
        harness.provideRequestsWithSnapshot(expiredSnapshot)
      );

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

  const baseLayer = Layer.mergeAll(
    VerisureSessionStore.InMemory,
    transport,
    CredentialCrypto.Test({ pin: undefined }),
    CredentialRepository.Test({ credentials: [credential], statuses }),
    Layer.succeed(CurrentCredential, credential)
  );

  const authLayer = VerisureAuth.Live.pipe(Layer.provideMerge(baseLayer));

  const provide = <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof authLayer>>
  ) => Effect.provide(effect, authLayer);

  const provideRequestsWithSnapshot = (snapshot: SessionSnapshot) => {
    const requestsLayer = VerisureRequests.layer.pipe(
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
    );

    return <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof requestsLayer>>
    ) => Effect.provide(effect, requestsLayer);
  };

  return { calls, provide, provideRequestsWithSnapshot, statuses };
};
