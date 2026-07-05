# Effect-native guide

This document captures the refactor lessons learned while moving this codebase toward the style used by the Effect HTTP examples in `repos/effect/ai-docs/src/51_http-server` and the underlying Effect source.

It is meant for someone with no prior conversation context who needs to continue transforming the codebase into a well-written, Effect-native application.

## Core thesis

An Effect-native codebase keeps boundaries honest:

- services expose **semantic, transport-free errors**;
- HTTP adapters translate service semantics into HTTP errors;
- RPC adapters translate service semantics into RPC errors;
- middleware owns cross-cutting request concerns;
- endpoint handlers own endpoint-local expected failures;
- unexpected failures are defects or coarse unavailable errors, not giant public unions.

The goal is not “wrap every TypeScript union in a `reason` union”. The goal is to make every boundary expose the **smallest meaningful error surface it owns**.

---

## Reference pattern from Effect HTTP examples

Effect's HTTP example models domain errors like this:

```ts
export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  {},
  { httpApiStatus: 404 }
) {}

export class SearchQueryTooShort extends Schema.TaggedErrorClass<SearchQueryTooShort>()(
  "SearchQueryTooShort",
  {},
  { httpApiStatus: 422 }
) {}

export class UsersError extends Schema.TaggedErrorClass<UsersError>()(
  "UsersError",
  {
    reason: Schema.Union([UserNotFound, SearchQueryTooShort]),
  }
) {}
```

Then handlers handle expected reasons locally:

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

Important: `UsersError` is not a dumping ground. It is the semantic error boundary for the Users service. Reasons are few and meaningful to that service.

---

## Source-level behavior to understand

### 1. `HttpApi` automatically includes middleware errors

In `repos/effect/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts`, endpoint error schemas are computed from both endpoint-local errors and attached middleware errors:

```ts
export function getErrorSchemas(endpoint: AnyWithProps): Array<Schema.Top> {
  const schemas = new Set<Schema.Top>(endpoint.error);
  for (const middleware of endpoint.middlewares) {
    const key = middleware as any as HttpApiMiddleware.AnyService;
    for (const schema of key.error) {
      schemas.add(schema);
    }
  }
  return Array.from(schemas);
}
```

Meaning: if an endpoint uses middleware that declares `HttpApiError.Unauthorized`, the endpoint contract accepts that error automatically. Do not manually build a giant endpoint `error: [...]` list that repeats middleware errors.

Bad:

```ts
HttpApiEndpoint.post("toggleFull", "/toggle-full", {
  payload: TogglePayload,
  success: AlarmMutationResultSchema,
  error: [
    HttpApiError.Unauthorized,
    HttpApiError.Forbidden,
    HttpApiError.NotFound,
    ShortcutMfaRequired,
    HttpApiError.ServiceUnavailable,
  ],
});
```

Better:

```ts
HttpApiEndpoint.post("toggleFull", "/toggle-full", {
  payload: TogglePayload,
  success: AlarmMutationResultSchema,
  // only endpoint-local semantic errors belong here
  error: ShortcutMfaRequired,
}).middleware(ShortcutAuthorization);
```

If `ShortcutAuthorization` declares `HttpApiError.Unauthorized`, that error is already part of this endpoint through middleware composition.

### 2. `HttpApiBuilder` schema-encodes declared errors

In `HttpApiBuilder`, handler failures are encoded using the endpoint's error schema:

```ts
const encodeError = Schema.encodeUnknownEffect(makeErrorSchema(endpoint));

// ...
Effect.catch((error) => {
  if (HttpApiSchemaError.is(error)) return Effect.die(error);
  return Effect.orDie(encodeError(error));
});
```

So expected HTTP API failures must be declared either:

- on the endpoint; or
- on middleware attached to that endpoint.

If an error is not declared, it is not a contract error.

### 3. Low-level `HttpRouter` can render respondable HTTP errors

Effect HTTP errors such as `HttpApiError.Unauthorized`, `HttpApiError.Forbidden`, and `HttpApiError.ServiceUnavailable` implement `HttpServerRespondable`.

In `HttpServerError.causeResponse`, failures/defects that are respondable can render themselves:

```ts
Respondable.toResponseOrElse(reason.error, internalServerError);
```

This is useful at the low-level HTTP router boundary. It does **not** mean services should return `HttpApiError`. HTTP errors are transport concerns.

Use this shortcut only inside HTTP routing/adapters, not in domain/server services.

---

## Boundary rule: services do not expose HTTP or RPC errors

Services may be consumed by HTTP, RPC, tests, jobs, or future CLIs. Therefore service errors must not mention HTTP status codes or RPC protocol errors.

Bad service boundary:

```ts
interface ApiTokenServiceShape {
  readonly authenticate: (
    command: AuthenticateApiTokenCommand
  ) => Effect.Effect<
    AuthenticatedApiToken,
    HttpApiError.Unauthorized | HttpApiError.Forbidden
  >;
}
```

Good service boundary:

```ts
interface ApiTokenServiceShape {
  readonly authenticate: (
    command: AuthenticateApiTokenCommand
  ) => Effect.Effect<
    AuthenticatedApiToken,
    ApiTokenUnauthorized | ApiTokenForbidden | ServiceUnavailable
  >;
}
```

Then the HTTP adapter maps those semantic errors to HTTP errors:

```ts
apiTokens.authenticate(command).pipe(
  Effect.catchTag("ApiTokenUnauthorized", () =>
    Effect.fail(new HttpApiError.Unauthorized({}))
  ),
  Effect.catchTag("ApiTokenForbidden", () =>
    Effect.fail(new HttpApiError.Forbidden({}))
  ),
  Effect.catchTag("ServiceUnavailable", () =>
    Effect.die(new HttpApiError.ServiceUnavailable({}))
  )
);
```

And the RPC adapter maps them to RPC contract errors instead:

```ts
apiTokens.authenticate(command).pipe(
  Effect.catchTag("ApiTokenUnauthorized", () =>
    Effect.fail(new RpcContract.Unauthorized({}))
  ),
  Effect.catchTag("ApiTokenForbidden", () =>
    Effect.fail(new RpcContract.Forbidden({}))
  ),
  Effect.catchTag("ServiceUnavailable", Effect.die)
);
```

Same service. Different adapters. No transport leakage.

---

## Smell 1: exported type-union error surfaces

Bad:

```ts
export type VerisureAuthError =
  | VerisureDomainError
  | VerisureDomainErrorReason
  | CredentialCryptoError
  | RepositoryError
  | VerisureSessionStoreError;
```

Why it smells:

- callers learn implementation details;
- auth leaks repository/crypto/session store failures;
- raw domain reasons and wrapped domain errors coexist;
- downstream code needs normalization helpers.

Better:

```ts
export class VerisureAuthMfaRequired extends Schema.TaggedErrorClass<VerisureAuthMfaRequired>()(
  "VerisureAuthMfaRequired",
  { message: Schema.String }
) {}

export class VerisureAuthUnavailable extends Schema.TaggedErrorClass<VerisureAuthUnavailable>()(
  "VerisureAuthUnavailable",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect),
  }
) {}

export class VerisureAuthError extends Schema.TaggedErrorClass<VerisureAuthError>()(
  "VerisureAuthError",
  {
    reason: Schema.Union([VerisureAuthMfaRequired, VerisureAuthUnavailable]),
  }
) {}
```

Internal implementation collapses details at the boundary:

```ts
crypto.decryptCredential(credential).pipe(
  Effect.mapError(
    (cause) =>
      new VerisureAuthError({
        reason: new VerisureAuthUnavailable({
          cause,
          message: "Unable to decrypt Verisure credential",
        }),
      })
  )
);
```

Do not expose `CredentialCryptoError` just because the auth implementation uses crypto.

---

## Smell 2: mechanical wrapper reasons

Bad “fix”:

```ts
export class ShortcutScopeError extends Schema.TaggedErrorClass<ShortcutScopeError>()(
  "ShortcutScopeError",
  {
    reason: Schema.Union([
      ShortcutUnauthorized,
      ShortcutForbidden,
      ShortcutNotFound,
      ShortcutBadRequest,
      ShortcutRateLimited,
      ShortcutUnavailable,
    ]),
  }
) {}
```

This is just the old union moved into `reason`.

Better question: what semantic boundary is this?

If this is HTTP shortcut authorization, standard transport failures belong to HTTP middleware:

```ts
export class ShortcutAuthorization extends HttpApiMiddleware.Service<
  ShortcutAuthorization,
  { provides: ShortcutBearerToken }
>()("@verisure/api/ShortcutAuthorization", {
  error: HttpApiError.Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}
```

If this is endpoint-local MFA, keep only MFA custom:

```ts
export class ShortcutMfaRequired extends Schema.TaggedErrorClass<ShortcutMfaRequired>()(
  "ShortcutMfaRequired",
  { message: Schema.String },
  { httpApiStatus: 409 }
) {}
```

Do not create custom `ShortcutUnauthorizedError`, `ShortcutForbiddenError`, and `ShortcutServiceUnavailableError` unless the API truly needs custom bodies. Standard HTTP failures should use Effect's `HttpApiError.*` classes.

---

## Smell 3: pseudo-middleware functions

A chain of `Effect.provideService` calls inside an HTTP handler is often a sign that the code wants to be request middleware.

For example, this is structurally middleware-shaped:

```ts
return (
  yield *
  alarm.toggleFull(payload.code).pipe(
    Effect.provideService(CurrentUser, scope.user),
    Effect.provideService(CurrentCredential, scope.credential),
    Effect.provideService(CurrentInstallation, scope.installation),
    Effect.catchTag("AlarmCodeRequired", () =>
      Effect.fail(new HttpApiError.BadRequest({}))
    ),
    Effect.catchTag("ServiceUnavailable", () =>
      Effect.die(new HttpApiError.ServiceUnavailable({}))
    )
  )
);
```

The `provideService` part is request-scoped context provisioning. If those values can be derived from middleware inputs, it belongs in `HttpApiMiddleware`, not every handler.

Effect HTTP middleware supports this directly through `requires` / `provides` composition:

```ts
export class ShortcutPrincipalMiddleware extends HttpApiMiddleware.Service<
  ShortcutPrincipalMiddleware,
  {
    requires: ShortcutBearerToken;
    provides: CurrentUser | CurrentCredential | ShortcutApiToken;
  }
>()("@verisure/api/ShortcutPrincipalMiddleware", {
  error: HttpApiError.Unauthorized,
}) {}

export class ShortcutAlarmAccessMiddleware extends HttpApiMiddleware.Service<
  ShortcutAlarmAccessMiddleware,
  {
    requires: CurrentUser | CurrentCredential | ShortcutApiToken;
    provides: CurrentInstallation;
  }
>()("@verisure/api/ShortcutAlarmAccessMiddleware", {
  error: [HttpApiError.Forbidden, HttpApiError.NotFound, ShortcutMfaRequired],
}) {}
```

The second middleware can require services provided by the first. Effect tracks this through `HttpApiMiddleware.ApplyServices`, and endpoint errors contributed by middleware are inferred by `HttpApiEndpoint.getErrorSchemas`.

However, middleware should only depend on request metadata it can own without duplicating endpoint decoding. If installation identity is buried inside JSON payloads, middleware would have to re-read/re-decode the body, which fights `HttpApiBuilder`. Prefer API shapes where cross-cutting scope inputs are path params or headers:

```ts
HttpApiEndpoint.post("toggleFull", "/installations/:giid/alarm/toggle-full", {
  params: Schema.Struct({ giid: Schema.NonEmptyString }),
  payload: ToggleFullPayloadWithoutGiid,
  success: AlarmMutationResultSchema,
})
  .middleware(ShortcutAuthorization)
  .middleware(ShortcutPrincipalMiddleware)
  .middleware(ShortcutAlarmAccessMiddleware);
```

Then `ShortcutAlarmAccessMiddleware` can read the route params from the router request context and provide `CurrentInstallation` before the handler runs.

The handler becomes focused on endpoint behavior:

```ts
return (
  yield *
  alarm.toggleFull(payload.code).pipe(
    Effect.catchTag("AlarmCodeRequired", () =>
      Effect.fail(new HttpApiError.BadRequest({}))
    ),
    Effect.catchTag("ServiceUnavailable", () =>
      Effect.die(new HttpApiError.ServiceUnavailable({}))
    )
  )
);
```

Use handler-level `provideService` only when the value is truly endpoint-local and cannot be modeled as request middleware without duplicating request decoding.

Bad:

```ts
export const provideShortcutAlarmScope =
  (input: { giid: string; requiredScopes: readonly string[] }) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      // authenticate token
      // decrypt credential
      // verify installation access
      // provide CurrentUser / CurrentCredential / CurrentInstallation
      return yield* effect.pipe(
        Effect.provideService(CurrentUser, user),
        Effect.provideService(CurrentCredential, credential),
        Effect.provideService(CurrentInstallation, { giid: input.giid })
      );
    });
```

Why it smells:

- it has middleware responsibilities;
- `HttpApi` does not know it is middleware;
- its errors are not inferred by endpoint contracts;
- it mixes cross-cutting auth with endpoint-local `giid` logic.

Better split:

### HTTP middleware extracts/provides bearer credential

```ts
export class ShortcutAuthorization extends HttpApiMiddleware.Service<
  ShortcutAuthorization,
  { provides: ShortcutBearerToken }
>()("@verisure/api/ShortcutAuthorization", {
  error: HttpApiError.Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}
```

Implementation:

```ts
export const ShortcutAuthorizationLive = Layer.succeed(ShortcutAuthorization, {
  bearer: (httpEffect, { credential }) =>
    Effect.provideService(
      httpEffect,
      ShortcutBearerToken,
      ShortcutBearerToken.of({ value: Redacted.value(credential) })
    ),
});
```

### Endpoint-local scope service handles `giid`

```ts
const scope =
  yield *
  ShortcutAlarmScope.authorize({
    giid: payload.giid,
    requiredScopes: [ShortcutAlarmWriteScope],
  });

return (
  yield *
  alarm
    .toggleFull(payload.code)
    .pipe(
      Effect.provideService(CurrentUser, scope.user),
      Effect.provideService(CurrentCredential, scope.credential),
      Effect.provideService(CurrentInstallation, scope.installation)
    )
);
```

This keeps real middleware as middleware and endpoint-local data in the endpoint handler.

---

## Smell 4: normalizer helpers like `verisureReason`

Bad:

```ts
const verisureReason = (
  error: VerisureAuthError
): VerisureDomainErrorReason | undefined => {
  if (error instanceof VerisureDomainError) {
    return error.reason;
  }
  return error instanceof AuthenticationError ||
    error instanceof CookieReadError ||
    error instanceof CredentialsRejected ||
    error instanceof GraphQLError ||
    error instanceof LoginError ||
    error instanceof MFARequired ||
    error instanceof RateLimitError ||
    error instanceof RequestError ||
    error instanceof ResponseError
    ? error
    : undefined;
};
```

Why it smells:

- it exists because raw reasons and wrapped errors both leak;
- it duplicates the schema union with `instanceof` checks;
- adding a new domain reason requires updating multiple places.

Better: guarantee one shape at the boundary.

```ts
transport.request(request).pipe(Effect.mapError(ensureVerisureDomainError));
```

Then callers only inspect:

```ts
error.reason;
```

or use reason-aware handling:

```ts
transport.request(request).pipe(
  Effect.catchReasons(
    "VerisureDomainError",
    {
      MFARequired: (e) =>
        Effect.fail(
          new VerisureAuthError({
            reason: new VerisureAuthMfaRequired({ message: e.message }),
          })
        ),
    },
    (e) =>
      Effect.fail(
        new VerisureAuthError({
          reason: new VerisureAuthUnavailable({
            cause: e,
            message: "Verisure authentication failed",
          }),
        })
      )
  )
);
```

No `verisureReason`. No `isOneOfTheseTenClasses`.

---

## Smell 5: central broad mappers

Bad:

```ts
const updateStatusForError = (
  error: VerisureAuthError,
  setStatus: SetStatus
) => {
  const reason = verisureReason(error);
  if (reason instanceof MFARequired)
    return setStatus("mfa_required", reason.message);
  if (reason instanceof AuthenticationError)
    return setStatus("auth_failed", reason.message);
  if (reason instanceof RateLimitError)
    return setStatus("rate_limited", reason.message);
  if (reason instanceof LoginError)
    return setStatus("auth_failed", reason.message);
  return setStatus("error", "Verisure session operation failed");
};
```

Why it smells:

- it centralizes domain decisions after the fact;
- status transitions depend on low-level transport/domain implementation errors;
- it becomes a hidden second domain model.

Better: update status at semantic decision points.

```ts
if (text.includes("stepUpToken")) {
  yield *
    setStatus("mfa_required", "Verisure requires MFA", {
      mfaRequestedAt: new Date(),
    });

  return (
    yield *
    new VerisureAuthError({
      reason: new VerisureAuthMfaRequired({
        message: "Verisure requires multifactor authentication",
      }),
    })
  );
}
```

For internal failures, collapse locally:

```ts
refreshSession(snapshot).pipe(
  Effect.mapError(
    (cause) =>
      new VerisureAuthError({
        reason: new VerisureAuthUnavailable({
          cause,
          message: "Unable to refresh Verisure session",
        }),
      })
  )
);
```

The service should not need a central “what does this random low-level error mean?” function.

---

## Smell 6: broad request-layer error aliases

Bad:

```ts
export type VerisureRequestsError =
  | VerisureAuthError
  | VerisureDomainError
  | VerisureDomainErrorReason;
```

Why it smells:

- requests leak auth internals;
- requests leak transport/domain internals;
- raw and wrapped errors coexist;
- HTTP/RPC handlers must understand too much.

Better:

```ts
export class VerisureRequestsMfaRequired extends Schema.TaggedErrorClass<VerisureRequestsMfaRequired>()(
  "VerisureRequestsMfaRequired",
  { message: Schema.String }
) {}

export class VerisureRequestsUnavailable extends Schema.TaggedErrorClass<VerisureRequestsUnavailable>()(
  "VerisureRequestsUnavailable",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect),
  }
) {}

export class VerisureRequestsError extends Schema.TaggedErrorClass<VerisureRequestsError>()(
  "VerisureRequestsError",
  {
    reason: Schema.Union([
      VerisureRequestsMfaRequired,
      VerisureRequestsUnavailable,
    ]),
  }
) {}
```

Translate inline where the boundary context exists:

```ts
const session =
  yield *
  auth.ensureSession.pipe(
    Effect.catchReasons(
      "VerisureAuthError",
      {
        VerisureAuthMfaRequired: (e) =>
          Effect.fail(
            new VerisureRequestsError({
              reason: new VerisureRequestsMfaRequired({ message: e.message }),
            })
          ),
      },
      (e) =>
        Effect.fail(
          new VerisureRequestsError({
            reason: new VerisureRequestsUnavailable({
              cause: e,
              message: "Unable to authenticate Verisure request",
            }),
          })
        )
    )
  );
```

Avoid helpers like `authErrorToRequestReason`. They hide translation and create shared coupling. Inline translation is boring and explicit.

---

## Endpoint-local handler style

Bad:

```ts
alarm
  .toggleFull(payload.code)
  .pipe(
    provideShortcutAlarmScope({ giid: payload.giid, requiredScopes }),
    Effect.catchTags(bigSharedMapper)
  );
```

Good:

```ts
.handle("toggleFull", ({ payload }) =>
  Effect.gen(function* () {
    const scope = yield* shortcutScope.authorize({
      giid: payload.giid,
      requiredScopes: [ShortcutAlarmWriteScope]
    }).pipe(
      Effect.catchTag("ApiTokenUnauthorized", () =>
        Effect.fail(new HttpApiError.Unauthorized({}))
      ),
      Effect.catchTag("ApiTokenForbidden", () =>
        Effect.fail(new HttpApiError.Forbidden({}))
      ),
      Effect.catchTag("ShortcutInstallationNotFound", () =>
        Effect.fail(new HttpApiError.NotFound({}))
      ),
      Effect.catchTag("VerisureMfaRequired", (e) =>
        Effect.fail(new ShortcutMfaRequired({ message: e.message }))
      ),
      Effect.catchTag("ServiceUnavailable", () =>
        Effect.die(new HttpApiError.ServiceUnavailable({}))
      )
    )

    return yield* alarm.toggleFull(payload.code).pipe(
      Effect.provideService(CurrentUser, scope.user),
      Effect.provideService(CurrentCredential, scope.credential),
      Effect.provideService(CurrentInstallation, scope.installation),
      Effect.catchTag("AlarmCodeRequired", () =>
        Effect.fail(new HttpApiError.BadRequest({}))
      ),
      Effect.catchTag("ServiceUnavailable", () =>
        Effect.die(new HttpApiError.ServiceUnavailable({}))
      )
    )
  })
)
```

This looks longer than a mapper, but it is locally obvious. No hidden policy. No central union. Each endpoint declares what it truly expects.

If multiple endpoints repeat exactly the same authorization block, extract a small service method that returns a semantic scope result. Do not extract a broad error mapper.

---

## Contract declaration rule

Do not create reusable “all errors this API may throw” arrays.

Bad:

```ts
export const ShortcutRestErrorSchemas = [
  ShortcutUnauthorizedError,
  ShortcutForbiddenError,
  ShortcutInvalidInputError,
  ShortcutInstallationNotFoundError,
  ShortcutMfaRequiredError,
  ShortcutRateLimitError,
  ShortcutVerisureUpstreamError,
  ShortcutServiceUnavailableError,
] as const;
```

Better:

```ts
HttpApiEndpoint.get("status", "/status", {
  query: GiidQuery,
  success: ArmStateSchema,
  error: ShortcutMfaRequired, // if status can semantically surface MFA
});
```

And attach middleware:

```ts
class ShortcutAlarmApiGroup extends HttpApiGroup.make("alarm")
  .add(statusEndpoint, toggleFullEndpoint, setModeEndpoint)
  .middleware(ShortcutAuthorization)
  .middleware(ShortcutSchemaErrorHandler)
  .prefix("/api/v1/alarm") {}
```

Middleware errors are inferred by `HttpApiEndpoint.getErrorSchemas`. Endpoint errors should not become a convenience union.

---

## RPC-specific guidance

RPC contracts are not HTTP. Do not use `HttpApiError` in RPC contracts, handlers, middleware, or service boundaries.

Bad:

```ts
Rpc.make("AlarmToggleFull").setError(HttpApiError.Unauthorized);
```

Good:

```ts
export class AlarmCodeRequiredRpcError extends Schema.TaggedErrorClass<AlarmCodeRequiredRpcError>()(
  "AlarmCodeRequiredRpcError",
  { message: Schema.String }
) {}

Rpc.make("AlarmToggleFull")
  .setPayload(TogglePayload)
  .setSuccess(AlarmMutationResultSchema)
  .setError(AlarmCodeRequiredRpcError);
```

RPC middleware should declare authentication/session errors for RPC clients. Endpoint/RPC handlers should map only endpoint-local semantic service errors.

---

## Naming guidance

Names should reflect the boundary, not implementation detail.

Prefer:

```ts
VerisureDomainError; // low-level Verisure protocol/transport boundary
VerisureAuthError; // auth/session boundary
VerisureRequestsError; // GraphQL/request boundary
ServiceUnavailable; // service-level semantic unavailable
ShortcutMfaRequired; // HTTP shortcut protocol-specific response
```

Avoid:

```ts
ApplicationError;
DashboardRpcError;
ShortcutApplicationError;
VerisureSafeUpstreamError;
```

Those names usually hide broad unions and unclear ownership.

---

## Refactor checklist

When touching a module, ask:

1. Is this error type a TypeScript union exported from a boundary?
   - If yes, replace it with a semantic boundary error or smaller concrete semantic errors.

2. Does this service expose repository/crypto/session/transport errors?
   - If yes, collapse them inside the service.

3. Does this service expose HTTP or RPC errors?
   - If yes, move translation to the HTTP/RPC adapter.

4. Is this helper a central mapper?
   - If yes, inline expected handling at the endpoint/boundary where context exists.

5. Is this custom function actually middleware?
   - If yes, make it `HttpApiMiddleware` or `RpcMiddleware`.
   - If it needs endpoint payload/query values, it probably belongs in the endpoint handler or a semantic service, not middleware.

6. Is this endpoint declaring a reusable “all possible errors” array?
   - If yes, remove it. Declare only endpoint-local errors. Let middleware errors be inferred.

7. Are standard HTTP failures represented by custom error classes?
   - Prefer `HttpApiError.BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `ServiceUnavailable`, etc.
   - Keep custom HTTP errors only for product/protocol-specific responses.

8. Is there a helper like `toXError`, `mapXError`, `xReason`, or `authErrorToRequestReason`?
   - Treat it as suspicious. It may be hiding boundary coupling.

---

## Final target shape

A well-factored Effect-native path looks like this:

```txt
Low-level Verisure transport
  -> VerisureDomainError { reason: low-level protocol reason }

Verisure auth service
  -> VerisureAuthError { reason: MFA required | unavailable }

Verisure requests service
  -> VerisureRequestsError { reason: MFA required | unavailable }

Application services
  -> small semantic errors like AlarmCodeRequired | ServiceUnavailable

HTTP adapter
  -> HttpApiError.* for standard HTTP errors
  -> custom HttpApi schema errors only for product-specific HTTP responses

RPC adapter
  -> RPC schema errors only, never HttpApiError
```

The implementation should be boring:

- small services;
- small error channels;
- no broad unions;
- no central mappers;
- middleware as first-class middleware;
- endpoint-local expected error handling;
- transport-specific errors only at transport boundaries.
