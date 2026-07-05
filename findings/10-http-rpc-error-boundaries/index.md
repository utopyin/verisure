# 10 — HTTP/RPC error management is centralized but not contract-native

## What's wrong

The project has a single `ErrorMapper.ts` that translates broad application errors into RPC contract errors and then into REST HTTP responses. This is useful, but Effect's HTTP/RPC style pushes more error semantics into schema-backed API contracts and middleware definitions. Our current mapper is a large boundary adapter that knows too much about domain, server, RPC, and REST concerns.

References from `repos/effect`:

- `repos/effect/ai-docs/src/51_http-server/fixtures/api/Authorization.ts` — middleware error is declared in the middleware service with `httpApiStatus`.
- `repos/effect/ai-docs/src/51_http-server/fixtures/server/Authorization.ts` — middleware implementation fails with the declared schema error.
- `repos/effect/ai-docs/src/51_http-server/fixtures/server/Users/http.ts` — handlers use `Effect.catchReason(s)` to map known domain reasons and die unexpected ones.
- `repos/effect/ai-docs/src/01_effect/03_errors/10_catch-tags.ts` — typed errors are handled with tag-based combinators instead of broad instance checks.

## Concrete examples in our code

`apps/api/src/Http/ErrorMapper.ts` owns all of this:

```ts
export type ApplicationError =
  | PlatformError
  | Server.ApiTokenError
  | Server.CredentialCryptoError
  | Server.RepositoryError
  | Server.ScopeError
  | Server.ServiceError
  | Server.VerisureSessionStoreError
  | VerisureSafeUpstreamError;
```

It then maps using `instanceof` chains:

```ts
if (error instanceof Server.ScopeError) { ... }
if (isVerisureUpstreamError(error)) { ... }
if (error instanceof Server.ServiceError || error instanceof Server.ApiTokenError) { ... }
```

Then REST status is derived from RPC error variants:

```ts
export const toSafeHttpError = (
  error: RpcContract.DashboardRpcError
): SafeHttpError => {
  switch (error._tag) {
    case "Unauthorized":
      return restError(401, "unauthorized", error.message);
    // ...
  }
};
```

Handlers repeatedly apply the mapper:

```ts
"Alarm.GetArmState": () =>
  alarm.getArmState.pipe(Effect.mapError(toDashboardRpcError))
```

Middleware also maps application errors at a different level:

```ts
yield* Effect.gen(function* () { ... }).pipe(Effect.mapError(toDashboardRpcError));
```

## Specific discrepancies

- RPC contract errors are schema-backed, but domain/server errors are not, so mapping relies on `instanceof` and manual type unions.
- REST errors are projected from `DashboardRpcError`, even though REST could have its own schema-backed `HttpApi` errors with status annotations.
- Expected domain errors and unexpected defects are not sharply separated. Some repository/platform/session-store errors become `VerisureUpstreamError`, conflating internal storage/platform failures with upstream Verisure failures.
- Handler files repeat `.pipe(Effect.mapError(toDashboardRpcError))` for almost every method instead of using group-level middleware/interceptors or a service boundary that already exposes API errors.
- `absurd` throws a defect from an error mapper. In a schema-first boundary, unmapped errors should be forced by types closer to the handler or deliberately `Effect.die`d with context.

## Why it matters

- Error semantics are part of the API contract; central mapping makes them harder to discover from contract files.
- Broad `ApplicationError` can become a dumping ground as new services are added.
- REST and RPC should not necessarily share the same public error taxonomy. For example, an internal D1 outage is not a Verisure upstream error.
- Effect fixtures show middleware and endpoint errors declared alongside the API/middleware contract, enabling docs and client generation.

## Preferred shape

1. Make domain/server errors schema-backed or reason-backed (`02-schema-tagged-errors`).
2. Split public API errors by boundary:
   - `DashboardRpcError` for dashboard RPC.
   - `ShortcutRestError` / `HttpApi` errors for shortcut REST.
   - Internal defects/storage/platform failures mapped to a generic internal/service-unavailable error, not `VerisureUpstreamError`.
3. Move mapping closer to feature groups or middleware:

```ts
const mapAlarmError = Effect.catchTags({
  ScopeError: (e) => new InstallationNotFound(...),
  VerisureError: (e) => new VerisureUpstreamError(...)
})
```

4. For HTTP APIs, declare statuses on errors:

```ts
export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 }
) {}
```

5. Consider wrapping handler groups with one boundary mapper instead of repeating per-handler `mapError`.

## Relationship to existing findings

This extends `02-schema-tagged-errors` and `04-http-api-schema-first` with a higher-level public-boundary concern: which errors belong to which transport contract and where they should be projected.
