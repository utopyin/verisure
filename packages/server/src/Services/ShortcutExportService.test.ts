import { layer as BrowserCryptoLayer } from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import type { ApiTokenRecord } from "@verisure/interface";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { ApiTokenRepository } from "../Repositories/ApiTokenRepository";
import { CredentialRepository } from "../Repositories/CredentialRepository";
import { ShortcutExportRepository } from "../Repositories/ShortcutExportRepository";
import { UserRepository } from "../Repositories/UserRepository";
import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import { CurrentUser } from "../Security/RequestContext";
import { ApiTokenService } from "./ApiTokenService";
import { ShortcutExportService } from "./ShortcutExportService";

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
  connectionStatus: "connected" as const,
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
};

describe(ShortcutExportService, () => {
  it.effect(
    "exports Toggle Full Alarm fallback payload and records an audit row",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness();
        const result = yield* Effect.gen(function* () {
          const service = yield* ShortcutExportService;
          return yield* service.exportShortcut({
            credentialId: credential.id,
            giid: "GIID-1",
            template: "toggle-full",
          });
        }).pipe(harness.provide);

        expect(result.template).toBe("toggle-full");
        expect(result.shortcutName).toBe("Verisure Toggle Full Alarm");
        expect(result.apiUrl).toBe("https://verisure.utopy.sh/api/v1");
        expect(result.bearerToken.startsWith("vs_")).toBe(true);
        expect(result.instructions.join("\n")).toContain("/alarm/status");
        expect(result.instructions.join("\n")).toContain("/alarm/mode");
        expect(harness.exports).toHaveLength(1);
        const [auditRow] = harness.exports;
        expect(auditRow).toMatchObject({
          apiTokenId: result.apiToken.id,
          credentialId: credential.id,
          template: "toggle-full",
          userId: user.id,
        });
      })
  );

  it.effect("exports Choose Explicit Alarm Mode fallback payload", () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      const result = yield* Effect.gen(function* () {
        const service = yield* ShortcutExportService;
        return yield* service.exportShortcut({
          credentialId: credential.id,
          template: "choose-mode",
        });
      }).pipe(harness.provide);

      expect(result.template).toBe("choose-mode");
      expect(result.shortcutName).toBe("Verisure Choose Alarm Mode");
      expect(result.giid).toBeUndefined();
      expect(result.instructions.join("\n")).toContain("Choose from Menu");
      expect(result.instructions.join("\n")).toContain("Full off");
      expect(result.instructions.join("\n")).toContain("Full on");
      expect(harness.tokens[0]?.allowedGiids).toBeUndefined();
    })
  );
});

const makeHarness = () => {
  const tokens: ApiTokenRecord[] = [];
  const exports: unknown[] = [];

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
      findUsableByHash: () => Effect.die("unused"),
      getById: () => Effect.die("unused"),
      listForCredential: () => Effect.die("unused"),
      listForUser: () => Effect.die("unused"),
      markUsed: () => Effect.die("unused"),
      revoke: () => Effect.die("unused"),
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

  const shortcutExports = Layer.succeed(
    ShortcutExportRepository,
    ShortcutExportRepository.of({
      create: (input) => {
        const row = {
          apiTokenId: input.apiTokenId,
          createdAt: input.now,
          credentialId: input.credentialId,
          downloadNonceHash: input.downloadNonceHash ?? null,
          id: input.id,
          template: input.template,
          userId: input.userId,
        };
        exports.push(row);
        return Effect.succeed(row);
      },
      getById: () => Effect.die("unused"),
      listForCredential: () => Effect.die("unused"),
      listForUser: () => Effect.die("unused"),
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
      tokenPepper: Option.none(),
      verisureApplicationId: Option.none(),
      verisureBaseUrls: Option.none(),
    })
  );

  const layer = ShortcutExportService.Live.pipe(
    Layer.provideMerge(ApiTokenService.Live),
    Layer.provideMerge(
      Layer.mergeAll(
        apiTokens,
        BrowserCryptoLayer,
        credentials,
        runtime,
        shortcutExports,
        users,
        Layer.succeed(CurrentUser, user)
      )
    )
  );

  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, layer) as Effect.Effect<A, E, never>;

  return { exports, provide, tokens };
};
