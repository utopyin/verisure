import { layer as BrowserCryptoLayer } from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import type { VerisureCredentialRow } from "@verisure/db/schema";
import type { ApiTokenRecord } from "@verisure/interface";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";

import { ApiTokenRepository } from "../Repositories/ApiTokenRepository";
import { CredentialRepository } from "../Repositories/CredentialRepository";
import { UserRepository } from "../Repositories/UserRepository";
import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import { CurrentUser } from "../Security/RequestContext";
import {
  ApiTokenService,
  ShortcutAlarmReadScope,
  ShortcutAlarmWriteScope,
} from "./ApiTokenService";

const now = new Date("2026-01-01T00:00:00.000Z");

const user = {
  createdAt: now,
  email: "user@example.com",
  emailVerified: true,
  id: "user-1",
  image: null,
  name: "User One",
  updatedAt: now,
};

const credential = {
  alias: "Home",
  connectedAt: null,
  connectionStatus: "connected",
  connectionStatusMessage: null,
  createdAt: now,
  defaultGiid: "GIID-1",
  encryptedEmail: "encrypted-email",
  encryptedPassword: "encrypted-password",
  encryptedPin: null,
  id: "credential-1",
  lastConnectionAttemptAt: null,
  mfaRequestedAt: null,
  updatedAt: now,
  userId: user.id,
} satisfies VerisureCredentialRow;

describe(ApiTokenService, () => {
  it.effect("returns plaintext once and persists only hash and prefix", () =>
    Effect.gen(function* () {
      const harness = makeHarness();

      const result = yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        return yield* service.create({
          allowedGiids: ["GIID-1"],
          credentialId: credential.id,
          scopes: [ShortcutAlarmReadScope],
        });
      }).pipe(harness.provide);

      expect(result.plaintextToken.startsWith("vs_")).toBe(true);
      expect(result.token.displayPrefix).toBe(
        `${result.plaintextToken.slice(0, 10)}…`
      );
      expect(harness.tokens[0]?.tokenHash).toBe(result.token.tokenHash);
      expect(harness.tokens[0]?.tokenHash).not.toBe(result.plaintextToken);
      expect(JSON.stringify(harness.tokens)).not.toContain(
        result.plaintextToken
      );
    })
  );

  it.effect("uses TOKEN_PEPPER when hashing", () =>
    Effect.gen(function* () {
      const withoutPepper = makeHarness();
      const withPepper = makeHarness({ tokenPepper: "pepper" });

      const plain = "vs_test-token";
      const unpepperedHash = yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        return yield* service.hashPlaintextToken(plain);
      }).pipe(withoutPepper.provide);
      const pepperedHash = yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        return yield* service.hashPlaintextToken(plain);
      }).pipe(withPepper.provide);

      expect(pepperedHash).not.toBe(unpepperedHash);
    })
  );

  it.effect(
    "authenticates usable tokens, updates last-used, and checks scopes and giids",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness();

        const created = yield* Effect.gen(function* () {
          const service = yield* ApiTokenService;
          return yield* service.create({
            allowedGiids: ["GIID-1"],
            credentialId: credential.id,
            scopes: [ShortcutAlarmReadScope],
          });
        }).pipe(harness.provide);

        const authenticated = yield* Effect.gen(function* () {
          const service = yield* ApiTokenService;
          return yield* service.authenticate({
            giid: "GIID-1",
            plaintextToken: created.plaintextToken,
            requiredScopes: [ShortcutAlarmReadScope],
          });
        }).pipe(harness.provide);

        expect(authenticated.token.id).toBe(created.token.id);
        expect(harness.tokens[0]?.lastUsedAt).toBeInstanceOf(Date);

        const missingScope = yield* Effect.gen(function* () {
          const service = yield* ApiTokenService;
          return yield* service.authenticate({
            plaintextToken: created.plaintextToken,
            requiredScopes: [ShortcutAlarmWriteScope],
          });
        }).pipe(Effect.result, harness.provide);
        expect(Result.isFailure(missingScope)).toBe(true);

        const wrongGiid = yield* Effect.gen(function* () {
          const service = yield* ApiTokenService;
          return yield* service.authenticate({
            giid: "GIID-2",
            plaintextToken: created.plaintextToken,
            requiredScopes: [ShortcutAlarmReadScope],
          });
        }).pipe(Effect.result, harness.provide);
        expect(Result.isFailure(wrongGiid)).toBe(true);
      })
  );

  it.effect("rejects expired and revoked tokens", () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      const expired = yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        return yield* service.create({
          credentialId: credential.id,
          expiresAt: new Date("2000-01-01T00:00:00.000Z"),
          scopes: [ShortcutAlarmReadScope],
        });
      }).pipe(harness.provide);

      const expiredResult = yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        return yield* service.authenticate({
          plaintextToken: expired.plaintextToken,
        });
      }).pipe(Effect.result, harness.provide);
      expect(Result.isFailure(expiredResult)).toBe(true);

      const active = yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        return yield* service.create({
          credentialId: credential.id,
          scopes: [ShortcutAlarmReadScope],
        });
      }).pipe(harness.provide);
      yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        yield* service.revoke({ tokenId: active.token.id });
      }).pipe(harness.provide);

      const revokedResult = yield* Effect.gen(function* () {
        const service = yield* ApiTokenService;
        return yield* service.authenticate({
          plaintextToken: active.plaintextToken,
        });
      }).pipe(Effect.result, harness.provide);
      expect(Result.isFailure(revokedResult)).toBe(true);
    })
  );
});

const makeHarness = (options: { readonly tokenPepper?: string } = {}) => {
  const tokens: ApiTokenRecord[] = [];

  const apiTokens = Layer.succeed(
    ApiTokenRepository,
    ApiTokenRepository.of({
      create: (input) => {
        const token = {
          ...(input.allowedGiids === undefined
            ? {}
            : { allowedGiids: input.allowedGiids }),
          createdAt: input.now,
          credentialId: input.credentialId,
          displayPrefix: input.displayPrefix,
          expiresAt: input.expiresAt ?? null,
          id: input.id,
          lastUsedAt: null,
          revokedAt: null,
          scopes: input.scopes,
          tokenHash: input.tokenHash,
          updatedAt: input.now,
          userId: input.userId,
        } satisfies ApiTokenRecord;
        tokens.push(token);
        return Effect.succeed(token);
      },
      findUsableByHash: (input) =>
        Effect.succeed(
          Option.fromNullishOr(
            tokens.find(
              (token) =>
                token.tokenHash === input.tokenHash &&
                token.revokedAt === null &&
                (token.expiresAt === null || token.expiresAt > input.now)
            )
          )
        ),
      getById: (id) =>
        Effect.succeed(Option.fromNullishOr(tokens.find((t) => t.id === id))),
      listForCredential: ({ credentialId, userId }) =>
        Effect.succeed(
          tokens.filter(
            (token) =>
              token.credentialId === credentialId && token.userId === userId
          )
        ),
      listForUser: (userId) =>
        Effect.succeed(tokens.filter((token) => token.userId === userId)),
      markUsed: ({ id, usedAt }) => {
        const index = tokens.findIndex((token) => token.id === id);
        if (index === -1) {
          return Effect.succeed(Option.none());
        }
        const token = tokens[index];
        if (token === undefined) {
          return Effect.succeed(Option.none());
        }
        const updated = { ...token, lastUsedAt: usedAt };
        tokens[index] = updated;
        return Effect.succeed(Option.some(updated));
      },
      revoke: ({ id, revokedAt, userId }) => {
        const index = tokens.findIndex(
          (token) => token.id === id && token.userId === userId
        );
        if (index === -1) {
          return Effect.succeed(Option.none());
        }
        const token = tokens[index];
        if (token === undefined) {
          return Effect.succeed(Option.none());
        }
        const updated = { ...token, revokedAt };
        tokens[index] = updated;
        return Effect.succeed(Option.some(updated));
      },
    })
  );

  const credentials = Layer.succeed(
    CredentialRepository,
    CredentialRepository.of({
      create: () => Effect.die("unused"),
      delete: () => Effect.die("unused"),
      getById: () => Effect.die("unused"),
      getOwnedById: ({ id, userId }) =>
        Effect.succeed(
          id === credential.id && userId === credential.userId
            ? Option.some(credential)
            : Option.none()
        ),
      listForUser: () => Effect.die("unused"),
      setConnectionStatus: () => Effect.die("unused"),
      setDefaultInstallation: () => Effect.die("unused"),
      update: () => Effect.die("unused"),
    })
  );

  const users = Layer.succeed(
    UserRepository,
    UserRepository.of({
      getById: (id) =>
        Effect.succeed(id === user.id ? Option.some(user) : Option.none()),
    })
  );

  const runtime = Layer.succeed(
    RuntimeConfig,
    RuntimeConfig.of({
      appBaseUrl: "https://verisure.utopy.sh",
      betterAuthSecret: Redacted.make("better-auth-secret"),
      credentialEncryptionKey: Redacted.make("credential-key"),
      emailFrom: "test@example.com",
      tokenPepper:
        options.tokenPepper === undefined
          ? Option.none()
          : Option.some(Redacted.make(options.tokenPepper)),
      verisureApplicationId: Option.none(),
      verisureBaseUrls: Option.none(),
    })
  );

  const layer = ApiTokenService.Live.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        apiTokens,
        BrowserCryptoLayer,
        credentials,
        runtime,
        users,
        Layer.succeed(CurrentUser, {
          email: user.email,
          id: user.id,
        })
      )
    )
  );

  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, layer) as Effect.Effect<A, E, never>;

  return { provide, tokens };
};
