# 04 — REST API is manual-router-first instead of schema-first `HttpApi`

## What's wrong

The Effect HTTP examples define API schemas separately from handlers, implement handlers with `HttpApiBuilder.group`, and then serve a composed API layer. Our shortcut REST API uses `HttpRouter.add` directly, manually decodes params/json, and manually maps validation errors.

References from `repos/effect`:

- `repos/effect/ai-docs/src/51_http-server/10_basics.ts` — “Api definitions should always be separate from the server implementation” and uses `HttpApiBuilder.layer(Api, { openapiPath })`.
- `repos/effect/ai-docs/src/51_http-server/fixtures/api/Api.ts` — central API definition.
- `repos/effect/ai-docs/src/51_http-server/fixtures/api/Users.ts` — endpoint definitions with payload/query/success/error schemas.
- `repos/effect/ai-docs/src/51_http-server/fixtures/server/Users/http.ts` — handlers implemented via `HttpApiBuilder.group`.

## Concrete examples in our code

`apps/api/src/Http/RestApi.ts` defines routes manually:

```ts
yield* api.add(
  "GET",
  "/alarm/status",
  HttpRouter.schemaParams(GiidQuery).pipe(
    Effect.mapError((cause) => new RpcContract.InvalidInput({ ... })),
    Effect.matchEffect({
      onFailure: toHttpServerResponse,
      onSuccess: (query) => Server.AlarmService.pipe(...)
    })
  )
);
```

The Effect fixture separates API definition and handler implementation:

```ts
export const UsersApiHandlers = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fn(function*(handlers) {
    const users = yield* Users
    return handlers.handle("list", ({ query }) => users.list(query.search).pipe(...))
  })
)
```

## Specific discrepancies

- Request/response schemas are local to `RestApi.ts`; they are not a reusable API contract.
- Validation errors are manually converted to `RpcContract.InvalidInput` even though HTTP API fixtures model request errors in the API layer.
- Error-to-response behavior is centralized in `ErrorMapper.ts`, but not attached to schema-tagged HTTP errors with status annotations.
- There is no generated OpenAPI route or scalar docs for the shortcut REST surface.
- The RPC contract package already follows a schema-first pattern; REST is the outlier.

## Why it matters

- Schema-first APIs give better end-to-end type checking and docs.
- Handler code becomes simpler: it receives decoded `payload`, `query`, and `params` rather than handling decode/match manually.
- Errors can be expressed in the API contract rather than cast through `applicationErrorToHttpServerResponse`.
- The codebase would align with Effect’s HTTP fixtures and its existing RPC-contract style.

## Preferred shape

Create a package or module for the REST contract, for example:

```ts
export const ShortcutApi = HttpApi.make("ShortcutApi").add(
  HttpApiGroup.make("alarm").add(
    HttpApiEndpoint.get("status", "/alarm/status")
      .setUrlParams(GiidQuery)
      .addSuccess(ArmStateSchema)
      .addError(Unauthorized)
      .addError(Forbidden)
  )
);
```

Then implement:

```ts
export const ShortcutApiHandlers = HttpApiBuilder.group(
  ShortcutApi,
  "alarm",
  Effect.fn("ShortcutApi.handlers")(function* (handlers) {
    const alarm = yield* Server.AlarmService;
    return handlers.handle("status", ({ urlParams }) => alarm.getArmState);
  })
);
```

Keep `HttpRouter` for truly untyped escape hatches; use `HttpApi` for stable public REST endpoints.
