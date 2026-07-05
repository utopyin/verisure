import type { Cookie } from "@verisure/shared/cookies";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as TxSemaphore from "effect/TxSemaphore";

import { CurrentCredential } from "../Security/RequestContext";

export interface SessionCookie extends Omit<Cookie, "expires"> {
  readonly expires?: number;
}

export interface SessionMfaState {
  readonly requestedAt: number;
  readonly cookies: readonly SessionCookie[];
}

export interface SessionSnapshot {
  readonly cookies: readonly SessionCookie[];
  readonly trustToken?: {
    readonly trustTokenValue: string;
    readonly expiresAt?: number;
  };
  readonly preferredBaseUrl?: string;
  readonly authenticatedAt: number;
  readonly expiresAt: number;
}

export class VerisureSessionStoreError extends Schema.TaggedErrorClass<VerisureSessionStoreError>()(
  "VerisureSessionStoreError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}

interface VerisureSessionStoreShape {
  readonly getSnapshot: Effect.Effect<
    Option.Option<SessionSnapshot>,
    VerisureSessionStoreError,
    CurrentCredential
  >;
  readonly putSnapshot: (
    snapshot: SessionSnapshot
  ) => Effect.Effect<void, VerisureSessionStoreError, CurrentCredential>;
  readonly clearSnapshot: Effect.Effect<
    void,
    VerisureSessionStoreError,
    CurrentCredential
  >;
  readonly getMfaState: Effect.Effect<
    Option.Option<SessionMfaState>,
    VerisureSessionStoreError,
    CurrentCredential
  >;
  readonly putMfaState: (
    mfa: SessionMfaState
  ) => Effect.Effect<void, VerisureSessionStoreError, CurrentCredential>;
  readonly clearMfaState: Effect.Effect<
    void,
    VerisureSessionStoreError,
    CurrentCredential
  >;
  readonly withCredentialLock: <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | VerisureSessionStoreError, R | CurrentCredential>;
}

export class VerisureSessionStore extends Context.Service<
  VerisureSessionStore,
  VerisureSessionStoreShape
>()("@verisure/server/VerisureSessionStore") {
  static readonly InMemory = Layer.effect(
    VerisureSessionStore,
    Effect.gen(function* () {
      const snapshots = yield* Ref.make(new Map<string, SessionSnapshot>());
      const mfaStates = yield* Ref.make(new Map<string, SessionMfaState>());
      const locks = yield* Ref.make(new Map<string, TxSemaphore.TxSemaphore>());

      const currentCredentialId = Effect.map(CurrentCredential, ({ id }) => id);

      const getLock = Effect.fn("VerisureSessionStore.getLock")(function* (
        credentialId: string
      ) {
        const semaphore = yield* TxSemaphore.make(1);
        return yield* Ref.modify(locks, (map) => {
          const existing = map.get(credentialId);
          if (existing !== undefined) {
            return [existing, map];
          }
          return [semaphore, new Map([...map, [credentialId, semaphore]])];
        });
      });

      const getSnapshot = Effect.gen(function* () {
        const credentialId = yield* currentCredentialId;
        const map = yield* Ref.get(snapshots);
        return Option.fromNullishOr(map.get(credentialId));
      }).pipe(Effect.withSpan("VerisureSessionStore.getSnapshot"));

      const putSnapshot: VerisureSessionStoreShape["putSnapshot"] = Effect.fn(
        "VerisureSessionStore.putSnapshot"
      )(function* (snapshot) {
        const credentialId = yield* currentCredentialId;
        yield* Ref.update(snapshots, (map) =>
          new Map(map).set(credentialId, snapshot)
        );
      });

      const clearSnapshot = Effect.gen(function* () {
        const credentialId = yield* currentCredentialId;
        yield* Ref.update(snapshots, (map) => {
          const next = new Map(map);
          next.delete(credentialId);
          return next;
        });
      }).pipe(Effect.withSpan("VerisureSessionStore.clearSnapshot"));

      const getMfaState = Effect.gen(function* () {
        const credentialId = yield* currentCredentialId;
        const map = yield* Ref.get(mfaStates);
        return Option.fromNullishOr(map.get(credentialId));
      }).pipe(Effect.withSpan("VerisureSessionStore.getMfaState"));

      const putMfaState: VerisureSessionStoreShape["putMfaState"] = Effect.fn(
        "VerisureSessionStore.putMfaState"
      )(function* (mfa) {
        const credentialId = yield* currentCredentialId;
        yield* Ref.update(
          mfaStates,
          (map) => new Map([...map, [credentialId, mfa]])
        );
      });

      const clearMfaState = Effect.gen(function* () {
        const credentialId = yield* currentCredentialId;
        yield* Ref.update(mfaStates, (map) => {
          const next = new Map(map);
          next.delete(credentialId);
          return next;
        });
      }).pipe(Effect.withSpan("VerisureSessionStore.clearMfaState"));

      const withCredentialLock: VerisureSessionStoreShape["withCredentialLock"] =
        Effect.fn("VerisureSessionStore.withCredentialLock")(
          function* (effect) {
            const credentialId = yield* currentCredentialId;
            const semaphore = yield* getLock(credentialId);
            return yield* effect.pipe(TxSemaphore.withPermit(semaphore));
          }
        );

      return VerisureSessionStore.of({
        clearMfaState,
        clearSnapshot,
        getMfaState,
        getSnapshot,
        putMfaState,
        putSnapshot,
        withCredentialLock,
      });
    })
  );
}
