import { describe, expect, it } from "@effect/vitest";
import { testCredentialRow } from "@verisure/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import { CurrentCredential } from "../Security/RequestContext";
import type { SessionMfaState, SessionSnapshot } from "./VerisureSessionStore";
import { VerisureSessionStore } from "./VerisureSessionStore";

const credential = {
  ...testCredentialRow,
  connectionStatus: "unchecked" as const,
  defaultGiid: null,
  encryptedEmail: "email",
  encryptedPassword: "password",
};

const snapshot = {
  authenticatedAt: 1000,
  cookies: [{ name: "vid", value: "session" }],
  expiresAt: 2000,
  preferredBaseUrl: "https://automation01.verisure.com",
} satisfies SessionSnapshot;

const mfa = {
  cookies: [{ name: "mfa", value: "pending" }],
  requestedAt: 3000,
} satisfies SessionMfaState;

describe(VerisureSessionStore, () => {
  it.effect("stores, reads, and clears a session snapshot", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        const store = yield* VerisureSessionStore;
        yield* store.putSnapshot(snapshot);
        const stored = yield* store.getSnapshot;
        yield* store.clearSnapshot;
        const cleared = yield* store.getSnapshot;
        return { cleared, stored };
      }).pipe(provideStore);

      expect(result.stored._tag).toBe("Some");
      expect(Option.getOrThrow(result.stored)).toStrictEqual(snapshot);
      expect(result.cleared._tag).toBe("None");
    })
  );

  it.effect("stores and clears temporary MFA state", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        const store = yield* VerisureSessionStore;
        yield* store.putMfaState(mfa);
        const stored = yield* store.getMfaState;
        const snapshotAfterMfa = yield* store.getSnapshot;
        yield* store.clearMfaState;
        const cleared = yield* store.getMfaState;
        return { cleared, snapshotAfterMfa, stored };
      }).pipe(provideStore);

      expect(result.stored._tag).toBe("Some");
      expect(Option.getOrThrow(result.stored)).toStrictEqual(mfa);
      expect(result.snapshotAfterMfa._tag).toBe("None");
      expect(result.cleared._tag).toBe("None");
    })
  );

  it.effect("serializes credential-scoped effects", () =>
    Effect.gen(function* () {
      const trace = yield* Effect.gen(function* () {
        const store = yield* VerisureSessionStore;
        const events = yield* Ref.make<readonly string[]>([]);
        const append = (event: string) =>
          Ref.update(events, (current) => [...current, event]);
        const task = (id: string) =>
          Effect.gen(function* () {
            yield* append(`${id}:start`);
            yield* Effect.yieldNow;
            yield* append(`${id}:end`);
          }).pipe(store.withCredentialLock);

        yield* Effect.all([task("a"), task("b")], { concurrency: 2 });
        return yield* Ref.get(events);
      }).pipe(provideStore);

      expect(trace).toHaveLength(4);
      const first = trace[0]?.split(":")[0];
      expect(trace[1]).toBe(`${first}:end`);
    })
  );
});

const storeLayer = Layer.mergeAll(
  VerisureSessionStore.InMemory,
  Layer.succeed(CurrentCredential, credential)
);

const provideStore = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof storeLayer>>
) => Effect.provide(effect, storeLayer);
