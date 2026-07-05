# Progress — 06 Effectful Drizzle adapter

## what to do

- Decide whether the prototype-patching adapter is an accepted architecture decision.
- If accepted, document why and add concurrency/context propagation tests.
- If rejected, replace with explicit query wrappers or repository-level `Effect.tryPromise` boundaries.

## what is done

- Reviewed `packages/db/src/drizzle.ts`.
- Compared with Effect wrapping/service examples.
- Documented risks and possible alternatives.
- Added `docs/adr/0001-drizzle-effectful-adapter.md`, accepting the current prototype-patching/currentContext adapter only as a temporary migration bridge.
- Recorded ADR requirements for regression coverage before any replacement: SQL error mapping, fiber context propagation, concurrent/nested query isolation, and unchanged repository service APIs.

## what is next

- Do not change DB production code as part of this documentation-only slice.
- Before replacing the adapter, add the ADR-required regression tests and migrate query boundaries incrementally behind existing repository/service APIs.
- Prefer explicit repository or database-service query wrappers for the future migration.
