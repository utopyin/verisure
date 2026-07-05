# 01 — Effect-returning boundaries should be named `Effect.fn`

## What's wrong

The Effect repo guidance says: when writing functions that return an `Effect`, prefer `Effect.fn("name")` and avoid creating functions that return `Effect.gen`. This gives better traces/spans and makes service method boundaries explicit.

References from `repos/effect`:

- `repos/effect/LLMS.md` — “Prefer writing Effect code with `Effect.gen` & `Effect.fn("name")`” and “Avoid creating functions that return an `Effect.gen`, use `Effect.fn` instead.”
- `repos/effect/ai-docs/src/01_effect/01_basics/02_effect-fn.ts` — `export const effectFunction = Effect.fn("effectFunction")(function*(...))`.
- `repos/effect/ai-docs/src/01_effect/02_services/01_service.ts` — service methods are built as `Effect.fn("Database.query")(function*(sql) { ... })` inside the layer.
- `repos/effect/ai-docs/src/51_http-server/fixtures/server/Users.ts` — repository methods are `Effect.fn("UsersRepo.list")`, `Effect.fn("UsersRepo.getById")`, etc.

## Concrete examples in our code

### Named service methods are inconsistent

Idiomatic examples from Effect define service methods with `Effect.fn`:

```ts
const query = Effect.fn("Database.query")(function* (sql: string) {
  yield* Effect.log("Executing SQL query:", sql);
  return [{ id: 1, name: "Alice" }];
});
```

Our code sometimes does this well, for example `packages/server/src/Services/ApiTokenService.ts`:

```ts
const create: ApiTokenServiceShape["create"] = Effect.fn(
  "ApiTokenService.create"
)(function* (command) { ... })
```

But many service methods are anonymous `Effect.gen` constants or direct `Effect.gen` object fields:

- `packages/server/src/Services/AlarmService.ts`
  - `const getArmState = Effect.gen(function* () { ... })`
  - `const toggleFull: AlarmServiceShape["toggleFull"] = (code) => Effect.gen(function* () { ... })`
- `packages/server/src/Services/CredentialService.ts`
  - `const list = Effect.gen(function* () { ... })`
  - `const deleteCredential = Effect.gen(function* () { ... })`
  - `const requestMfa = Effect.gen(function* () { ... })`
- `packages/server/src/Services/DeviceService.ts`
  - `const listDoorWindows = Effect.gen(function* () { ... })`
  - `const listClimate = Effect.gen(function* () { ... })`
- `packages/server/src/Verisure/VerisureAuth.ts`
  - `const loginWithBasicAuth = Effect.gen(function* () { ... })`
  - `const recoverExpiredSnapshot = (snapshot) => Effect.gen(function* () { ... })`
  - `const validateMfa = (token) => Effect.gen(function* () { ... })`
- `apps/api/src/SessionStoreLive.ts`
  - object methods such as `clearMfaState: Effect.gen(function* () { ... })`.

## Why it matters

- Effect's examples rely on `Effect.fn` as the stable boundary for operations that will show up in traces and stack debugging.
- Anonymous `Effect.gen` constants make the code harder to inspect in traces, especially in the Verisure session/auth flow where many nested operations share the same shape.
- The mixture of styles makes it unclear which effects are private local steps and which are service API methods.

## Preferred shape

For exported helpers and service methods:

```ts
const listDoorWindows = Effect.fn("DeviceService.listDoorWindows")(
  function* () {
    const giid = yield* currentGiid;
    return yield* requests.doorWindows({ giid });
  }
);
```

For parameterized local operations:

```ts
const refreshSession = Effect.fn("VerisureAuth.refreshSession")(function* (
  snapshot: SessionSnapshot
) {
  // ...
});
```

Keep plain `Effect.gen` for one-off composition bodies and top-level programs, as shown in the Effect examples.
