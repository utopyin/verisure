import type { VerisureCredentialRow } from "@verisure/db/schema";
import {
  AuthenticationError,
  GraphQLError,
  RequestError,
} from "@verisure/domain";
import type { ConnectionStatus } from "@verisure/domain";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as HttpHeaders from "effect/unstable/http/Headers";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, test } from "vitest";

import { CredentialRepository } from "../Repositories/CredentialRepository.ts";
import { RepositoryError } from "../Repositories/RepositoryError.ts";
import { CredentialCrypto } from "../Security/CredentialCrypto.ts";
import { CurrentCredential } from "../Security/RequestContext.ts";
import { VerisureAuth } from "./VerisureAuth.ts";
import { VerisureGraphQL } from "./VerisureGraphQL.ts";
import * as VerisureOperations from "./VerisureOperations.ts";
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
  test("logs in with basic auth, verifies installations, and stores a snapshot", async () => {
    const harness = makeHarness([
      response("{}", "vid=one; Path=/, vs-refresh=refresh; Path=/"),
      response('[{"data":{"account":{"installations":[]}}}]'),
    ]);

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        return yield* auth.ensureSession;
      }).pipe(harness.provide)
    );

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
  });

  test("requests MFA and stores temporary MFA cookies separately", async () => {
    const harness = makeHarness([
      response(
        '{"stepUpToken":"step-up"}',
        "step=one; Path=/, vid=pending; Path=/"
      ),
      response("{}", "mfa=two; Path=/"),
    ]);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* auth.requestMfa;
        const mfa = yield* store.getMfaState;
        const snapshot = yield* store.getSnapshot;
        return { mfa, snapshot };
      }).pipe(harness.provide)
    );

    expect(harness.calls.map((call) => call.url)).toStrictEqual([
      "/auth/login",
      "/auth/mfa?type=phone",
    ]);
    expect(result.snapshot._tag).toBe("None");
    expect(
      Option.getOrThrow(result.mfa).cookies.map((cookie) => cookie.name)
    ).toStrictEqual(["step", "vid", "mfa"]);
    expect(harness.statuses.at(-1)?.status).toBe("mfa_required");
  });

  test("validates MFA, stores trust token, and clears temporary MFA state", async () => {
    const harness = makeHarness([
      response("{}", "vid=authenticated; Path=/, vs-refresh=refresh; Path=/"),
      response('{"trustTokenValue":"trust-token"}', "vs-trust=trusted; Path=/"),
      response('[{"data":{"account":{"installations":[]}}}]'),
    ]);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putMfaState({
          cookies: [{ name: "step", value: "one" }],
          requestedAt: Date.now(),
        });
        const snapshot = yield* auth.validateMfa("123456");
        const mfa = yield* store.getMfaState;
        return { mfa, snapshot };
      }).pipe(harness.provide)
    );

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
  });

  test("refreshes expired snapshots with refresh cookies", async () => {
    const harness = makeHarness([
      response("{}", "vid=new; Path=/, vs-refresh=new-refresh; Path=/"),
    ]);

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot(expiredSnapshot);
        return yield* auth.ensureSession;
      }).pipe(harness.provide)
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
  });

  test("falls back to basic login when refresh authentication fails", async () => {
    const harness = makeHarness([
      new AuthenticationError({ message: "expired", statusCode: 401 }),
      response("{}", "vid=one; Path=/, vs-refresh=refresh; Path=/"),
      response('[{"data":{"account":{"installations":[]}}}]'),
    ]);

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot(expiredSnapshot);
        return yield* auth.ensureSession;
      }).pipe(harness.provide)
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
  });

  test("falls back to trust-cookie login when refresh cookies are unavailable", async () => {
    const harness = makeHarness([
      response("{}", "vid=trusted-session; Path=/, vs-refresh=refresh; Path=/"),
      response('[{"data":{"account":{"installations":[]}}}]'),
    ]);

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot({
          ...expiredSnapshot,
          cookies: [{ name: "vs-trust", value: "trusted" }],
          trustToken: { trustTokenValue: "trust-token" },
        });
        return yield* auth.ensureSession;
      }).pipe(harness.provide)
    );

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
  });

  test("logs out and clears stored session state", async () => {
    const harness = makeHarness([response("{}"), response("{}")]);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* VerisureAuth;
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot({
          ...expiredSnapshot,
          trustToken: { trustTokenValue: "trust-token" },
        });
        yield* auth.logout;
        return yield* store.getSnapshot;
      }).pipe(harness.provide)
    );

    expect(harness.calls.map((call) => call.url)).toStrictEqual([
      "/auth/trust/trust-token",
      "/auth/logout",
    ]);
    expect(result._tag).toBe("None");
    expect(harness.statuses.at(-1)?.status).toBe("unchecked");
  });
});

describe(VerisureGraphQL, () => {
  test("executes with ensured session cookies and maps GraphQL errors", async () => {
    const harness = makeHarness([
      response('[{"errors":[{"message":"boom"}]}]'),
    ]);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const graphql = yield* VerisureGraphQL;
        const operation = VerisureOperations.armState({ giid: "GIID" });
        return yield* Effect.flip(graphql.execute(operation));
      }).pipe(harness.provideGraphQLWithSnapshot(expiredSnapshot))
    );

    expect(error).toBeInstanceOf(GraphQLError);
    expect(harness.calls[0]?.headers.cookie).toContain("vid=old");
  });
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

  const transport = Layer.succeed(
    VerisureTransport,
    VerisureTransport.of({
      preferredBaseUrl: Effect.succeed("https://automation01.test"),
      request: (request) =>
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
        }),
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

  const provideGraphQLWithSnapshot =
    (snapshot: SessionSnapshot) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(
        effect,
        VerisureGraphQL.Live.pipe(
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

  return { calls, provide, provideGraphQLWithSnapshot, statuses };
};
