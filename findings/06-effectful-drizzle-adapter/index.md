# 06 — Drizzle adapter uses prototype monkey-patching and mutable runtime context

## What's wrong

`packages/db/src/drizzle.ts` makes Drizzle query promises implement `Effect` by augmenting module types and patching prototypes at runtime. It also uses a module-level mutable `currentContext` to carry the active fiber context into Drizzle's remote callback.

This is clever, but it is much more invasive than patterns shown in Effect examples. Effect examples typically wrap external APIs with explicit service methods or `Effect.tryPromise`, rather than making foreign promise classes globally Effectable.

References from `repos/effect`:

- `repos/effect/ai-docs/src/01_effect/01_basics/10_creating-effects.ts` — demonstrates wrapping promise APIs with `Effect.tryPromise` at explicit boundaries.
- `repos/effect/ai-docs/src/01_effect/02_services/01_service.ts` — external capability is represented as a service method returning `Effect`.
- `repos/effect/ai-docs/src/01_effect/02_services/20_layer-composition.ts` — SQL access is via `SqlClient` service, not global patching of another library's query class.

## Concrete examples in our code

`packages/db/src/drizzle.ts` augments Drizzle interfaces:

```ts
declare module "drizzle-orm/query-promise" {
  interface QueryPromise<T> extends Effect.Effect<T, SqlError> {}
}
```

Then patches prototypes:

```ts
const patchQueryPromise = (prototype: object) => {
  if ("pipe" in prototype) {
    return;
  }
  void Object.assign(prototype, queryPromiseEffectPrototype);
};

patchQueryPromise(QueryPromise.prototype);
patchQueryPromise(SQLiteSelectBase.prototype);
```

And uses module-level context mutation:

```ts
let currentContext: Context.Context<never> | undefined;

const previous = currentContext;
currentContext = fiber.context;
try {
  return await (this as unknown as QueryPromise<unknown>).execute();
} finally {
  currentContext = previous;
}
```

## Why it matters

- Global prototype patching can break when Drizzle changes internals or if multiple versions/classes are loaded.
- Module-level `currentContext` is fragile under concurrent fibers, nested Drizzle calls, or unexpected async boundaries.
- It makes queries look magically effectful (`db.query...pipe(...)`) rather than explicitly wrapped, which obscures where effects enter the system.
- This is harder for future contributors to compare with Effect fixtures, because the project appears to extend Effect's runtime model rather than use normal wrapping/layer patterns.

## Counterpoint

The goal is valid: repositories become ergonomic because Drizzle calls can be yielded/piped as Effects. This may be an intentional adapter. The finding is not “delete this immediately”; it is “this deserves a design decision and tests because it is non-idiomatic and invasive.”

## Preferred alternatives to evaluate

1. Explicit wrapper helpers:

```ts
const runQuery = <A>(query: QueryPromise<A>) =>
  Effect.tryPromise({
    try: () => query.execute(),
    catch: (cause) => toSqlError(cause, "Failed to execute Drizzle query"),
  });
```

2. Repository methods hide Drizzle promises and return Effects, matching the service examples.

3. A dedicated `Database` service exposes explicit effectful query functions rather than pretending Drizzle's query type is an Effect.

4. If prototype patching is kept, document it as an ADR and add concurrency/regression tests specifically for context propagation.
