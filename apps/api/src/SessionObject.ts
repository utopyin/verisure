import type {
  SessionMfaState,
  SessionSnapshot,
} from "@verisure/server/Verisure";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

interface VerisureSessionLock {
  readonly ownerId: string;
  readonly expiresAt: number;
}

interface AcquireLockInput {
  readonly ownerId: string;
  readonly ttlMs: number;
  readonly now: number;
}

interface VerisureSessionObjectApi {
  readonly getSnapshot: () => Effect.Effect<SessionSnapshot | null>;
  readonly putSnapshot: (snapshot: SessionSnapshot) => Effect.Effect<void>;
  readonly clearSnapshot: () => Effect.Effect<void>;
  readonly getMfaState: () => Effect.Effect<SessionMfaState | null>;
  readonly putMfaState: (mfa: SessionMfaState) => Effect.Effect<void>;
  readonly clearMfaState: () => Effect.Effect<void>;
  readonly acquireLock: (input: AcquireLockInput) => Effect.Effect<boolean>;
  readonly releaseLock: (ownerId: string) => Effect.Effect<boolean>;
}

export class VerisureSessionObject extends Cloudflare.DurableObjectNamespace<
  VerisureSessionObject,
  VerisureSessionObjectApi
>()("VerisureSessionObject") {}

const SnapshotKey = "snapshot";
const MfaKey = "mfa";
const LockKey = "lock";

export const VerisureSessionObjectLive = VerisureSessionObject.make(
  Effect.succeed(
    Effect.gen(function* makeSessionObject() {
      const state = yield* Cloudflare.DurableObjectState;

      const getSnapshot = () =>
        state.storage
          .get<SessionSnapshot>(SnapshotKey)
          .pipe(Effect.map((snapshot) => snapshot ?? null));

      const putSnapshot = (snapshot: SessionSnapshot) =>
        state.storage.put(SnapshotKey, snapshot);

      const clearSnapshot = () =>
        state.storage.delete(SnapshotKey).pipe(Effect.asVoid);

      const getMfaState = () =>
        state.storage
          .get<SessionMfaState>(MfaKey)
          .pipe(Effect.map((mfa) => mfa ?? null));

      const putMfaState = (mfa: SessionMfaState) =>
        state.storage.put(MfaKey, mfa);

      const clearMfaState = () =>
        state.storage.delete(MfaKey).pipe(Effect.asVoid);

      const acquireLock = (input: AcquireLockInput) =>
        Effect.gen(function* () {
          const current =
            yield* state.storage.get<VerisureSessionLock>(LockKey);
          if (
            current !== undefined &&
            current.expiresAt > input.now &&
            current.ownerId !== input.ownerId
          ) {
            return false;
          }
          yield* state.storage.put(LockKey, {
            expiresAt: input.now + input.ttlMs,
            ownerId: input.ownerId,
          } satisfies VerisureSessionLock);
          return true;
        });

      const releaseLock = (ownerId: string) =>
        Effect.gen(function* () {
          const current =
            yield* state.storage.get<VerisureSessionLock>(LockKey);
          if (current?.ownerId !== ownerId) {
            return false;
          }
          yield* state.storage.delete(LockKey);
          return true;
        });

      return {
        acquireLock,
        clearMfaState,
        clearSnapshot,
        getMfaState,
        getSnapshot,
        putMfaState,
        putSnapshot,
        releaseLock,
      };
    })
  )
);

export default VerisureSessionObjectLive;
