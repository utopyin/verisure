# ADR 0001 — Temporary Drizzle Effectful Adapter

## Status

Accepted as a temporary adapter.

## Context

`packages/db/src/drizzle.ts` makes Drizzle query promises usable as Effect values by augmenting Drizzle module types, patching query prototypes, and carrying the active fiber context through a module-level `currentContext` during remote callback execution.

This gives repositories an ergonomic boundary today: query values can be yielded or piped like Effects and are mapped to `SqlError` consistently. It also avoids a large repository rewrite while the database service boundaries are still evolving.

The approach is intentionally non-standard. Effect examples generally wrap promise-returning APIs at explicit service or repository boundaries with `Effect.tryPromise`, rather than globally changing third-party prototypes or relying on mutable runtime context.

## Decision

Keep the current adapter for now, but treat it as a migration bridge rather than a permanent architectural pattern.

No additional production code should depend on prototype patching beyond the existing database adapter boundary. New repository code may continue using the adapter only while it remains the project-wide database convention.

## Risks

- **Prototype patching:** Drizzle internals or duplicate Drizzle versions could bypass the patched prototypes or change runtime behavior.
- **`currentContext` mutation:** A module-level active context is fragile under concurrency, nested query execution, or future async boundary changes.
- **Type/runtime mismatch:** Module augmentation makes Drizzle query promises appear to implement `Effect`, even though that behavior depends on runtime patching.
- **Contributor surprise:** The adapter hides the explicit Effect boundary and differs from the wrapping patterns used in Effect examples.

## Migration requirements

Before replacing the adapter, add regression coverage that proves the current behavior that repositories rely on:

- Drizzle query failures are mapped to the expected `SqlError` shape.
- Fiber-local context required by the D1 remote callback is preserved.
- Concurrent and nested query execution cannot leak context between fibers.
- Existing repository service APIs remain unchanged from callers' perspective.

A replacement should migrate query boundaries explicitly, either through repository-local `Effect.tryPromise` wrappers or a database service helper. The migration must be incremental behind existing service APIs and should not combine adapter removal with unrelated repository redesign.

## Consequences

- Finding 06 is resolved as a design decision only in this slice.
- The adapter remains a known risk until the migration tests and explicit query-boundary replacement are implemented.
- Future work must not interpret this ADR as approval for broader prototype-patching patterns elsewhere in the codebase.
