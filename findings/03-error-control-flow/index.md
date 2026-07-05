# 03 — Error control flow uses values, mutation, and manual loops in places where Effect combinators would be clearer

## What's wrong

Several retry/fallback sections convert failures into success-channel values with `Effect.result` or `Effect.matchEffect`, mutate `lastError`, and use JavaScript loops to decide the next effect. That works, but it is less idiomatic than keeping failures in the error channel and composing recovery with Effect combinators.

References from `repos/effect`:

- `repos/effect/ai-docs/src/01_effect/03_errors/01_error-handling.ts` — uses `Effect.catch`, `Effect.catchTag`, and `Effect.catchTags` for typed recovery.
- `repos/effect/ai-docs/src/51_http-server/fixtures/server/Users/http.ts` — uses `Effect.catchReason` / `Effect.catchReasons` to selectively recover or re-fail.
- `repos/effect/ai-docs/src/06_schedule/10_schedules.ts` — retry behavior is attached with `Effect.retry` and `Schedule`, not hand-rolled loops.

## Concrete examples in our code

### `VerisureTransport.request`

`packages/server/src/Verisure/VerisureTransport.ts` does host failover with a mutable `lastError` and a custom success/failure object:

```ts
let lastError: VerisureDomainError = new RequestError({
  message: "Verisure request did not run",
});

for (const baseUrl of orderedBaseUrls) {
  const attempt = yield* Effect.gen(function* () { ... }).pipe(
    Effect.mapError(httpClientErrorToRequestError),
    Effect.matchEffect({
      onFailure: (error) => Effect.succeed({ _tag: "Failure" as const, error }),
      onSuccess: (response) => Effect.succeed({ _tag: "Success" as const, response }),
    })
  );

  if (attempt._tag === "Failure") {
    lastError = attempt.error;
    continue;
  }
  // ...
}

return yield* lastError;
```

This lowers errors into the success channel, then re-raises them later. An idiomatic Effect refactor would model “try this base URL; fail if this base URL is unusable; stop on non-retryable errors” as effects and compose with `Effect.firstSuccessOf`, `Effect.catchTag(s)`, or schedule/retry primitives.

### `VerisureAuth.recoverExpiredSnapshot`

`packages/server/src/Verisure/VerisureAuth.ts` uses `Effect.result` and `Result.isSuccess` to branch:

```ts
const refreshed = yield * Effect.result(refreshSession(snapshot));
if (Result.isSuccess(refreshed)) {
  return refreshed.success;
}
if (!canTryTrustLogin(refreshed.failure)) {
  return yield * refreshed.failure;
}
```

The Effect fixtures show selective error handling in the error channel instead:

```ts
users.getById(params.id).pipe(
  Effect.catchReasons(
    "UsersError",
    {
      UserNotFound: (e) => Effect.fail(e),
    },
    Effect.die
  )
);
```

A similar shape could be used for “if this failure reason permits fallback, try the next strategy; otherwise re-fail”.

### `VerisureAuth.requestMfa`

`requestMfa` loops over MFA types with a mutable `lastError`:

```ts
let lastError: VerisureAuthError = new LoginError({ ... });
for (const mfaType of MfaTypes) {
  const attempt = yield* Effect.result(transport.request(...));
  if (Result.isSuccess(attempt)) { ... return; }
  lastError = attempt.failure;
}
return yield* lastError;
```

This is a good candidate for `Effect.forEach` plus a first-success combinator, or a named helper that preserves typed failure semantics.

## Why it matters

- Typed errors are the main control-flow primitive in Effect. Moving them into ordinary values loses the benefits of `catchTag`, `catchTags`, `retry`, `orElse`, and tracing.
- Mutable `lastError` variables make retry/failover behavior harder to reason about and test.
- Combining this with unnamed `Effect.gen` blocks makes failure traces hard to identify.

## Preferred shape

- Keep each attempt as `Effect.Effect<A, E>`.
- Use `Effect.catchTag(s)` / `Effect.catchReason(s)` for selective fallback.
- Use `Effect.retry` + `Schedule` for retry policies.
- Use a first-success abstraction for ordered alternatives where all alternatives share the same success type.
- Give each attempt/fallback helper a name with `Effect.fn`, per finding 01.
