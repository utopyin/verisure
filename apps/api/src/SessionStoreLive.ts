import { CurrentCredential } from "@verisure/server";
import type { VerisureSessionStoreError } from "@verisure/server/Verisure";
import { VerisureSessionStore } from "@verisure/server/Verisure";
import type { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { VerisureSessionObject } from "./SessionObject";

const LockTtlMs = 30_000;
const LockRetryMs = 50;

export const VerisureSessionStoreLive = Layer.effect(
  VerisureSessionStore,
  Effect.gen(function* () {
    const namespace = yield* VerisureSessionObject;
    const runtimeContext = yield* Effect.context<RuntimeContext>();

    const getStub = Effect.map(CurrentCredential, ({ id }) =>
      namespace.getByName(id)
    );

    const acquire = Effect.fn("VerisureSessionStoreLive.acquire")(function* (
      ownerId: string
    ) {
      while (true) {
        const stub = yield* getStub;
        const acquired = yield* stub
          .acquireLock({
            now: Date.now(),
            ownerId,
            ttlMs: LockTtlMs,
          })
          .pipe(Effect.provide(runtimeContext));
        if (acquired) {
          return ownerId;
        }
        yield* Effect.sleep(LockRetryMs);
      }
    });

    const withCredentialLock: WithCredentialLock = Effect.fn(
      "VerisureSessionStoreLive.withCredentialLock"
    )(function* (effect) {
      const stub = yield* getStub;
      const ownerId = crypto.randomUUID();
      yield* acquire(ownerId);
      return yield* effect.pipe(
        Effect.ensuring(
          stub.releaseLock(ownerId).pipe(
            Effect.provide(runtimeContext),
            Effect.ignore({
              log: true,
              message: "Failed to release Verisure session lock",
            })
          )
        )
      );
    });

    return VerisureSessionStore.of({
      clearMfaState: Effect.gen(function* () {
        const stub = yield* getStub;
        yield* stub.clearMfaState().pipe(Effect.provide(runtimeContext));
      }).pipe(Effect.withSpan("VerisureSessionStoreLive.clearMfaState")),
      clearSnapshot: Effect.gen(function* () {
        const stub = yield* getStub;
        yield* stub.clearSnapshot().pipe(Effect.provide(runtimeContext));
      }).pipe(Effect.withSpan("VerisureSessionStoreLive.clearSnapshot")),
      getMfaState: Effect.gen(function* () {
        const stub = yield* getStub;
        const mfa = yield* stub
          .getMfaState()
          .pipe(Effect.provide(runtimeContext));
        return Option.fromNullishOr(mfa);
      }).pipe(Effect.withSpan("VerisureSessionStoreLive.getMfaState")),
      getSnapshot: Effect.gen(function* () {
        const stub = yield* getStub;
        const snapshot = yield* stub
          .getSnapshot()
          .pipe(Effect.provide(runtimeContext));
        return Option.fromNullishOr(snapshot);
      }).pipe(Effect.withSpan("VerisureSessionStoreLive.getSnapshot")),
      putMfaState: Effect.fn("VerisureSessionStoreLive.putMfaState")(
        function* (mfa) {
          const stub = yield* getStub;
          yield* stub.putMfaState(mfa).pipe(Effect.provide(runtimeContext));
        }
      ),
      putSnapshot: Effect.fn("VerisureSessionStoreLive.putSnapshot")(
        function* (snapshot) {
          const stub = yield* getStub;
          yield* stub
            .putSnapshot(snapshot)
            .pipe(Effect.provide(runtimeContext));
        }
      ),
      withCredentialLock,
    });
  })
);

type WithCredentialLock = <A, E, R>(
  effect: Effect.Effect<A, E, R>
) => Effect.Effect<A, E | VerisureSessionStoreError, R | CurrentCredential>;
