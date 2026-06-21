import { CurrentCredential } from "@verisure/server";
import {
  VerisureSessionStore,
  VerisureSessionStoreError,
} from "@verisure/server/Verisure";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { VerisureSessionObject } from "./SessionObject";

const LockTtlMs = 30_000;
const LockRetryMs = 50;

type WithCredentialLock = <A, E, R>(
  effect: Effect.Effect<A, E, R>
) => Effect.Effect<A, E | VerisureSessionStoreError, R | CurrentCredential>;

const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new VerisureSessionStoreError({
          cause,
          message: "Verisure session store operation failed",
        })
    )
  );

export const VerisureSessionStoreLive = Layer.effect(
  VerisureSessionStore,
  Effect.gen(function* () {
    const namespace = yield* VerisureSessionObject;

    const getStub = Effect.map(CurrentCredential, ({ id }) =>
      namespace.getByName(id)
    );

    const acquire = (ownerId: string) =>
      Effect.gen(function* () {
        while (true) {
          const stub = yield* getStub;
          const acquired = yield* wrap(
            stub.acquireLock({
              now: Date.now(),
              ownerId,
              ttlMs: LockTtlMs,
            })
          );
          if (acquired) {
            return ownerId;
          }
          yield* Effect.sleep(LockRetryMs);
        }
      });

    const withCredentialLock: WithCredentialLock = (effect) =>
      Effect.gen(function* () {
        const stub = yield* getStub;
        const ownerId = crypto.randomUUID();
        yield* acquire(ownerId);
        return yield* effect.pipe(
          Effect.ensuring(
            wrap(stub.releaseLock(ownerId)).pipe(
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
        yield* wrap(stub.clearMfaState());
      }),
      clearSnapshot: Effect.gen(function* () {
        const stub = yield* getStub;
        yield* wrap(stub.clearSnapshot());
      }),
      getMfaState: Effect.gen(function* () {
        const stub = yield* getStub;
        const mfa = yield* wrap(stub.getMfaState());
        return Option.fromNullishOr(mfa);
      }),
      getSnapshot: Effect.gen(function* () {
        const stub = yield* getStub;
        const snapshot = yield* wrap(stub.getSnapshot());
        return Option.fromNullishOr(snapshot);
      }),
      putMfaState: (mfa) =>
        Effect.gen(function* () {
          const stub = yield* getStub;
          yield* wrap(stub.putMfaState(mfa));
        }),
      putSnapshot: (snapshot) =>
        Effect.gen(function* () {
          const stub = yield* getStub;
          yield* wrap(stub.putSnapshot(snapshot));
        }),
      withCredentialLock,
    });
  })
);
