# 07 — Effect tests work, but harness shape is noisier than Effect fixtures

## What's wrong

The codebase uses `@effect/vitest` correctly, but many tests wrap the operation under test in nested `Effect.gen` blocks and custom provider functions. Effect's testing examples keep a single top-level program per test and make layers/harnesses direct and reusable.

References from `repos/effect`:

- `repos/effect/ai-docs/src/09_testing/10_effect-tests.ts` — tests use one `it.effect(... => Effect.gen(...))` body and direct assertions.
- `repos/effect/ai-docs/src/09_testing/20_layer-tests.ts` — constructs a `TestLayer` and provides it clearly to programs.
- `repos/effect/packages/platform-*/*test*` examples commonly define reusable layers and keep each test's effect body focused.

## Concrete examples in our code

`packages/server/src/Verisure/VerisureTransport.test.ts`:

```ts
it.effect("adds APPLICATION_ID and preserves request cookies", () =>
  Effect.gen(function* () {
    const { calls, provideTransport } = makeFetch([response(200, "ok")]);

    yield* Effect.gen(function* () {
      const transport = yield* VerisureTransport;
      return yield* transport.request(HttpClientRequest.get("/auth/token", ...));
    }).pipe(provideTransport);

    expect(calls).toHaveLength(1);
  })
);
```

The inner program is just the action under test. A cleaner style is either a named helper or direct provision at the boundary:

```ts
const program = Effect.fn("test.requestAuthToken")(function*() {
  const transport = yield* VerisureTransport
  return yield* transport.request(HttpClientRequest.get("/auth/token", ...))
})

const response = yield* program().pipe(provideTransport)
```

Or, for simple cases, inline once:

```ts
const transport = yield* VerisureTransport
yield* transport.request(...)
```

inside an effect already provided with the layer.

Other representative files with repeated nested programs:

- `packages/server/src/Services/ApiTokenService.test.ts`
- `packages/server/src/Services/AlarmService.test.ts`
- `packages/server/src/Services/ShortcutExportService.test.ts`
- `packages/server/src/Verisure/VerisureAuth.test.ts`
- `packages/server/src/Verisure/VerisureSessionStore.test.ts`
- `apps/api/src/Rpc/index.test.ts`

## Why it matters

- Tests are executable documentation for Effect style. Noisy nested effects teach future code to duplicate the pattern.
- Repeated `Effect.gen(...).pipe(harness.provide)` makes individual test intent harder to see.
- Named helpers improve trace names and shrink test bodies.
- The Effect fixtures demonstrate concise top-level effect tests and reusable layers.

## Preferred shape

- Keep `it.effect`.
- Build reusable test layers with explicit names.
- Extract common operations into `Effect.fn` helpers when reused.
- Avoid `yield* Effect.gen(...).pipe(provide)` inside another `Effect.gen` unless the point of the test is changing the provided environment mid-test.

Example target:

```ts
const requestPing = Effect.fn("VerisureTransportTest.requestPing")(function*() {
  const transport = yield* VerisureTransport
  return yield* transport.request(HttpClientRequest.get("/ping"))
})

it.effect("fails over", () =>
  Effect.gen(function*() {
    const harness = makeFetch([...])
    const first = yield* requestPing().pipe(harness.provideTransport)
    // assertions
  })
)
```
