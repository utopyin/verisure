import { layer as BrowserCryptoLayer } from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import type { ShortcutExportRow } from "@verisure/db/schema";
import type { ApiTokenRecord } from "@verisure/interface";
import { testCredentialRow, testUser, testUserRow } from "@verisure/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ApiTokenRepository } from "../Repositories/ApiTokenRepository";
import { CredentialRepository } from "../Repositories/CredentialRepository";
import { ShortcutExportRepository } from "../Repositories/ShortcutExportRepository";
import { UserRepository } from "../Repositories/UserRepository";
import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import { CurrentUser } from "../Security/RequestContext";
import { ApiTokenService } from "./ApiTokenService";
import { ShortcutExportService } from "./ShortcutExportService";

describe(ShortcutExportService, () => {
  it.effect(
    "exports Toggle Full Alarm fallback payload and records an audit row",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness();
        const result = yield* Effect.gen(function* () {
          const service = yield* ShortcutExportService;
          return yield* service.exportShortcut({
            credentialId: testCredentialRow.id,
            giid: testCredentialRow.defaultGiid ?? "giid-1",
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
          credentialId: testCredentialRow.id,
          template: "toggle-full",
          userId: testUser.id,
        });
      })
  );

  it.effect("exports Choose Explicit Alarm Mode fallback payload", () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      const result = yield* Effect.gen(function* () {
        const service = yield* ShortcutExportService;
        return yield* service.exportShortcut({
          credentialId: testCredentialRow.id,
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
  const exports: ShortcutExportRow[] = [];

  const layer = ShortcutExportService.Live.pipe(
    Layer.provideMerge(ApiTokenService.Live),
    Layer.provideMerge(
      Layer.mergeAll(
        ApiTokenRepository.InMemory(tokens),
        BrowserCryptoLayer,
        CredentialRepository.Test({ credentials: [testCredentialRow] }),
        RuntimeConfig.Test(),
        ShortcutExportRepository.InMemory(exports),
        UserRepository.Test([testUserRow]),
        Layer.succeed(CurrentUser, testUser)
      )
    )
  );

  const provide = <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
  ) => Effect.provide(effect, layer);

  return { exports, provide, tokens };
};
