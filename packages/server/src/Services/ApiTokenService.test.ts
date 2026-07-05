import { layer as BrowserCryptoLayer } from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import type { ApiTokenRecord } from "@verisure/interface";
import { testCredentialRow, testUser, testUserRow } from "@verisure/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";

import { ApiTokenRepository } from "../Repositories/ApiTokenRepository";
import { CredentialRepository } from "../Repositories/CredentialRepository";
import { UserRepository } from "../Repositories/UserRepository";
import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import { CurrentUser } from "../Security/RequestContext";
import type {
  AuthenticateApiTokenCommand,
  CreateApiTokenCommand,
} from "./ApiTokenService";
import {
  ApiTokenService,
  ShortcutAlarmReadScope,
  ShortcutAlarmWriteScope,
} from "./ApiTokenService";

const createApiToken = Effect.fn("ApiTokenServiceTest.createApiToken")(
  function* (command: CreateApiTokenCommand) {
    const service = yield* ApiTokenService;
    return yield* service.create(command);
  }
);

const authenticateApiToken = Effect.fn(
  "ApiTokenServiceTest.authenticateApiToken"
)(function* (command: AuthenticateApiTokenCommand) {
  const service = yield* ApiTokenService;
  return yield* service.authenticate(command);
});

const hashPlaintextToken = Effect.fn("ApiTokenServiceTest.hashPlaintextToken")(
  function* (plaintextToken: string) {
    const service = yield* ApiTokenService;
    return yield* service.hashPlaintextToken(plaintextToken);
  }
);

const revokeApiToken = Effect.fn("ApiTokenServiceTest.revokeApiToken")(
  function* (tokenId: string) {
    const service = yield* ApiTokenService;
    return yield* service.revoke({ tokenId });
  }
);

describe(ApiTokenService, () => {
  it.effect("returns plaintext once and persists only hash and prefix", () =>
    Effect.gen(function* () {
      const harness = makeHarness();

      const result = yield* createApiToken({
        allowedGiids: [testCredentialRow.defaultGiid ?? "giid-1"],
        credentialId: testCredentialRow.id,
        scopes: [ShortcutAlarmReadScope],
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
      const unpepperedHash = yield* hashPlaintextToken(plain).pipe(
        withoutPepper.provide
      );
      const pepperedHash = yield* hashPlaintextToken(plain).pipe(
        withPepper.provide
      );

      expect(pepperedHash).not.toBe(unpepperedHash);
    })
  );

  it.effect(
    "authenticates usable tokens, updates last-used, and checks scopes and giids",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness();
        const giid = testCredentialRow.defaultGiid ?? "giid-1";

        const created = yield* createApiToken({
          allowedGiids: [giid],
          credentialId: testCredentialRow.id,
          scopes: [ShortcutAlarmReadScope],
        }).pipe(harness.provide);

        const authenticated = yield* authenticateApiToken({
          giid,
          plaintextToken: created.plaintextToken,
          requiredScopes: [ShortcutAlarmReadScope],
        }).pipe(harness.provide);

        expect(authenticated.token.id).toBe(created.token.id);
        expect(harness.tokens[0]?.lastUsedAt).toBeInstanceOf(Date);

        const missingScope = yield* authenticateApiToken({
          plaintextToken: created.plaintextToken,
          requiredScopes: [ShortcutAlarmWriteScope],
        }).pipe(Effect.result, harness.provide);
        expect(Result.isFailure(missingScope)).toBe(true);

        const wrongGiid = yield* authenticateApiToken({
          giid: "wrong-giid",
          plaintextToken: created.plaintextToken,
          requiredScopes: [ShortcutAlarmReadScope],
        }).pipe(Effect.result, harness.provide);
        expect(Result.isFailure(wrongGiid)).toBe(true);
      })
  );

  it.effect("rejects expired and revoked tokens", () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      const expired = yield* createApiToken({
        credentialId: testCredentialRow.id,
        expiresAt: new Date("2000-01-01T00:00:00.000Z"),
        scopes: [ShortcutAlarmReadScope],
      }).pipe(harness.provide);

      const expiredResult = yield* authenticateApiToken({
        plaintextToken: expired.plaintextToken,
      }).pipe(Effect.result, harness.provide);
      expect(Result.isFailure(expiredResult)).toBe(true);

      const active = yield* createApiToken({
        credentialId: testCredentialRow.id,
        scopes: [ShortcutAlarmReadScope],
      }).pipe(harness.provide);
      yield* revokeApiToken(active.token.id).pipe(harness.provide);

      const revokedResult = yield* authenticateApiToken({
        plaintextToken: active.plaintextToken,
      }).pipe(Effect.result, harness.provide);
      expect(Result.isFailure(revokedResult)).toBe(true);
    })
  );
});

const makeHarness = (options: { readonly tokenPepper?: string } = {}) => {
  const tokens: ApiTokenRecord[] = [];

  const layer = ApiTokenService.Live.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        ApiTokenRepository.InMemory(tokens),
        BrowserCryptoLayer,
        CredentialRepository.Test({ credentials: [testCredentialRow] }),
        RuntimeConfig.Test(options),
        UserRepository.Test([testUserRow]),
        Layer.succeed(CurrentUser, {
          email: testUser.email,
          id: testUser.id,
        })
      )
    )
  );

  const provide = <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
  ) => Effect.provide(effect, layer);

  return { provide, tokens };
};
