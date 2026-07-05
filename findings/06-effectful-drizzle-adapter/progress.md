# Progress — 06 Effectful Drizzle adapter

## what to do

- Decide whether the prototype-patching adapter is an accepted architecture decision.
- If accepted, document why and add concurrency/context propagation tests.
- If rejected, replace with explicit query wrappers or repository-level `Effect.tryPromise` boundaries.

## what is done

- Reviewed `packages/db/src/drizzle.ts`.
- Compared with Effect wrapping/service examples.
- Documented risks and possible alternatives.

## what is next

- Treat this as a design spike before implementation.
- If changing it, migrate repositories incrementally behind their existing service APIs.
- Dependencies: independent, but easier after `05-layer-composition-naming` clarifies database layer boundaries.
