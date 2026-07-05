# Effect-native refactor inventory

This file lists the concrete places in the current codebase that still need refactoring according to the guidance in [`docs/effect-native-refactor-guide.md`](./effect-native-refactor-guide.md).

Use this as the implementation checklist for the next refactor pass.

## Reference rules used in this inventory

1. **Services must not expose HTTP or RPC errors.** Services expose semantic domain/application errors only.
2. **HTTP middleware declares HTTP middleware errors.** Those errors are automatically accepted by endpoints that use the middleware.
3. **RPC middleware declares RPC middleware errors.** Those errors are automatically included in RPC error schemas through middleware composition.
4. **Endpoint/RPC contracts declare only endpoint-local expected errors.** Do not include auth/scope errors in every endpoint by hand.
5. **Avoid exported type-union error aliases at boundaries.** Prefer semantic boundary errors or endpoint-local explicit handling.
6. **Avoid central mappers and normalizer helpers.** Inline translation where the boundary context exists.
7. **Use standard Effect HTTP errors where possible.** Prefer `HttpApiError.Unauthorized`, `Forbidden`, `NotFound`, `BadRequest`, `ServiceUnavailable`, etc. Custom HTTP errors are only for product-specific protocol responses such as MFA-required.

Important Effect source facts:

- `HttpApiEndpoint.getErrorSchemas` automatically merges endpoint errors with middleware errors.
- `Rpc.ErrorSchema<R>` automatically merges RPC errors with middleware errors.
- `HttpApiError.*` values are schema errors and respondable HTTP errors.
- Non-HTTP services must not return `HttpApiError.*`.

---

## 1. Shortcut REST errors are still a broad custom HTTP error family

### Files

- `apps/api/src/Http/ShortcutErrors.ts`
- `apps/api/src/Http/ShortcutApi.ts`
- `apps/api/src/Http/ShortcutHandlers.ts`
- `apps/api/src/Http/ShortcutMiddleware.ts`
- `apps/api/src/Http/RestApi.test.ts`

### Current smell

`ShortcutErrors.ts` defines custom copies of standard HTTP failures:

```ts
ShortcutUnauthorizedError; // 401
ShortcutForbiddenError; // 403
ShortcutInvalidInputError; // 400
ShortcutInstallationNotFoundError; // 404
ShortcutServiceUnavailableError; // 503
```

It also defines a reusable broad endpoint error array:

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

Then every shortcut endpoint uses it:

```ts
error: ShortcutRestErrorSchemas;
```

This violates the contract declaration rule: endpoint contracts should not accept a generic “all errors this API may ever throw” union.

### Refactor target

Replace standard HTTP custom classes with Effect built-ins:

```ts
import { HttpApiError } from "effect/unstable/httpapi";
```

Use:

```ts
HttpApiError.BadRequest;
HttpApiError.Unauthorized;
HttpApiError.Forbidden;
HttpApiError.NotFound;
HttpApiError.ServiceUnavailable;
```

Keep only real product/protocol-specific HTTP errors, likely:

```ts
export class ShortcutMfaRequired extends Schema.TaggedErrorClass<ShortcutMfaRequired>()(
  "ShortcutMfaRequired",
  { message: Schema.String },
  { httpApiStatus: 409 }
) {}
```

For Verisure rate limiting:

- Effect currently has no built-in `429 TooManyRequests` in `HttpApiError.ts`.
- Prefer collapsing Verisure upstream rate limits to `HttpApiError.ServiceUnavailable` unless the public Shortcut API explicitly promises `429`.
- If `429` is required, define one generic HTTP error such as `TooManyRequests`, not `ShortcutRateLimitError`.

### Expected shape

`ShortcutApi.ts` should not import `ShortcutRestErrorSchemas`.

Example:

```ts
HttpApiEndpoint.post("toggleFull", "/toggle-full", {
  payload: ToggleFullPayload,
  success: Domain.AlarmMutationResultSchema,
  error: ShortcutMfaRequired, // only if this endpoint can surface MFA as a product-specific response
}).middleware(ShortcutAuthorization);
```

Authorization and schema errors should come from middleware and be inferred.

### Tests to update

`apps/api/src/Http/RestApi.test.ts` currently expects tags like:

```ts
ShortcutUnauthorizedError;
ShortcutInvalidInputError;
ShortcutForbiddenError;
ShortcutInstallationNotFoundError;
ShortcutServiceUnavailableError;
```

After the refactor, tests should assert status codes / no-content standard errors / the remaining product-specific error tag only. Do not keep tests coupled to removed custom classes.

---

## 2. `ShortcutAuthorization` still uses custom errors and manual header parsing

### File

- `apps/api/src/Http/ShortcutMiddleware.ts`

### Current smell

```ts
export class ShortcutAuthorization extends HttpApiMiddleware.Service<...>()(..., {
  error: ShortcutUnauthorizedError,
  security: { bearer: HttpApiSecurity.bearer ... }
}) {}
```

The middleware declares a custom `ShortcutUnauthorizedError` instead of the standard Effect HTTP unauthorized error.

`decodeBearerToken` also manually reads `HttpServerRequest.headers.authorization` even though `HttpApiSecurity.bearer` already decodes the bearer credential and passes it as `credential` to the middleware implementation.

### Refactor target

Declare the standard middleware error:

```ts
export class ShortcutAuthorization extends HttpApiMiddleware.Service<
  ShortcutAuthorization,
  { readonly provides: ShortcutBearerToken }
>()("@verisure/api/Http/ShortcutAuthorization", {
  error: HttpApiError.Unauthorized,
  security: {
    bearer: HttpApiSecurity.bearer.pipe(...)
  }
}) {}
```

Implementation should validate the decoded credential, not re-parse the header:

```ts
bearer: (effect, { credential }) => {
  const token = Redacted.value(credential);
  if (token.length === 0) {
    return Effect.fail(new HttpApiError.Unauthorized({}));
  }
  return Effect.provideService(
    effect,
    ShortcutBearerToken,
    ShortcutBearerToken.of({ value: token })
  );
};
```

### Why

`HttpApiEndpoint.getErrorSchemas` will automatically add `HttpApiError.Unauthorized` to every endpoint using this middleware.

---

## 3. `ShortcutSchemaErrorHandler` should use standard Bad Request or disappear

### File

- `apps/api/src/Http/ShortcutMiddleware.ts`

### Current smell

```ts
export class ShortcutSchemaErrorHandler extends HttpApiMiddleware.Service<ShortcutSchemaErrorHandler>()(
  "@verisure/api/Http/ShortcutSchemaErrorHandler",
  { error: ShortcutInvalidInputError }
) {}
```

This creates a custom `400` error class only for invalid input.

### Refactor target

Use `HttpApiError.BadRequest` if we only need a standard bad request response:

```ts
export class ShortcutSchemaErrorHandler extends HttpApiMiddleware.Service<ShortcutSchemaErrorHandler>()(
  "@verisure/api/Http/ShortcutSchemaErrorHandler",
  { error: HttpApiError.BadRequest }
) {}
```

Implementation:

```ts
HttpApiMiddleware.layerSchemaErrorTransform(ShortcutSchemaErrorHandler, () =>
  Effect.fail(new HttpApiError.BadRequest({}))
);
```

If no custom schema-error behavior is needed, remove this middleware and rely on default HTTP API schema handling / outer response handling.

---

## 4. `ShortcutScopeError` is a broad type-union error surface

### File

- `apps/api/src/Http/ShortcutMiddleware.ts`

### Current smell

```ts
type ShortcutScopeError =
  | ShortcutForbiddenError
  | ShortcutInstallationNotFoundError
  | ShortcutInvalidInputError
  | ShortcutMfaRequiredError
  | ShortcutRateLimitError
  | ShortcutServiceUnavailableError
  | ShortcutUnauthorizedError
  | ShortcutVerisureUpstreamError;
```

This helper owns the whole Shortcut REST contract. It mixes auth, scope, input, MFA, upstream, and availability failures.

### Refactor target

Delete `ShortcutScopeError`.

Do not mechanically replace it with:

```ts
ShortcutScopeError { reason: Schema.Union([...same big list...]) }
```

Instead split responsibilities:

1. `ShortcutAuthorization` middleware provides `ShortcutBearerToken` and fails with `HttpApiError.Unauthorized`.
2. A principal middleware or service authenticates the API token and provides `CurrentUser`, `CurrentCredential`, and token metadata.
3. An alarm access middleware or service verifies installation access and provides `CurrentInstallation`.
4. Endpoint handlers map only endpoint-local service errors.

---

## 5. `provideShortcutAlarmScope` is pseudo-middleware

### File

- `apps/api/src/Http/ShortcutMiddleware.ts`
- callers in `apps/api/src/Http/ShortcutHandlers.ts`

### Current smell

`provideShortcutAlarmScope` is a custom higher-order function that:

- authenticates the API token;
- decrypts credentials;
- calls Verisure;
- verifies installation access;
- provides `CurrentUser`, `CurrentCredential`, `CurrentInstallation`;
- maps a broad set of HTTP errors.

This is middleware-shaped but invisible to `HttpApi` as middleware.

### Refactor target

Turn the request-context provisioning into composable `HttpApiMiddleware`.

Proposed middleware chain:

```ts
ShortcutAuthorization
  -> provides ShortcutBearerToken

ShortcutApiTokenPrincipal
  -> requires ShortcutBearerToken
  -> provides CurrentUser | CurrentCredential | ShortcutApiToken

ShortcutAlarmAccess
  -> requires CurrentUser | CurrentCredential | ShortcutApiToken
  -> provides CurrentInstallation
```

Example shape:

```ts
export class ShortcutApiTokenPrincipal extends HttpApiMiddleware.Service<
  ShortcutApiTokenPrincipal,
  {
    requires: ShortcutBearerToken;
    provides: Server.CurrentUser | Server.CurrentCredential | ShortcutApiToken;
  }
>()("@verisure/api/ShortcutApiTokenPrincipal", {
  error: [HttpApiError.Unauthorized, HttpApiError.Forbidden],
}) {}
```

Then alarm access:

```ts
export class ShortcutAlarmAccess extends HttpApiMiddleware.Service<
  ShortcutAlarmAccess,
  {
    requires: Server.CurrentUser | Server.CurrentCredential | ShortcutApiToken;
    provides: Server.CurrentInstallation;
  }
>()("@verisure/api/ShortcutAlarmAccess", {
  error: [
    HttpApiError.NotFound,
    ShortcutMfaRequired,
    HttpApiError.ServiceUnavailable,
  ],
}) {}
```

The exact names should be improved, but the important structure is `requires` / `provides`.

### API shape change recommended

Middleware should not have to decode JSON payloads. Move `giid` into the path so access middleware can read route params:

```txt
GET  /api/v1/installations/:giid/alarm/status
POST /api/v1/installations/:giid/alarm/toggle-full
POST /api/v1/installations/:giid/alarm/mode
```

Then payloads no longer need `giid`:

```ts
const ToggleFullPayload = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
});
```

Handlers become focused:

```ts
alarm.toggleFull(payload.code).pipe(
  Effect.catchTag("AlarmCodeRequired", () =>
    Effect.fail(new HttpApiError.BadRequest({}))
  ),
  Effect.catchTag("ServiceUnavailable", () =>
    Effect.die(new HttpApiError.ServiceUnavailable({}))
  )
);
```

---

## 6. Shortcut handlers still map to custom HTTP errors

### File

- `apps/api/src/Http/ShortcutHandlers.ts`

### Current smell

Handlers produce custom errors:

```ts
new ShortcutInvalidInputError(...)
new ShortcutServiceUnavailableError(...)
```

### Refactor target

Use standard HTTP errors at the HTTP adapter:

```ts
Effect.catchTag("AlarmCodeRequired", () =>
  Effect.fail(new HttpApiError.BadRequest({}))
);
```

For unexpected service availability failures, either:

```ts
Effect.catchTag("ServiceUnavailable", () =>
  Effect.die(new HttpApiError.ServiceUnavailable({}))
);
```

or, if the endpoint contract intentionally declares `ServiceUnavailable` as expected:

```ts
Effect.catchTag("ServiceUnavailable", () =>
  Effect.fail(new HttpApiError.ServiceUnavailable({}))
);
```

Prefer not to put `ServiceUnavailable` in every endpoint contract unless clients are expected to handle it as a typed business failure.

---

## 7. `RestApi.ts` contains a broad central HTTP mapper

### File

- `apps/api/src/Http/RestApi.ts`

### Current smell

`ShortcutRestHttp` catches all causes and maps them centrally:

```ts
Effect.catchCause((cause) => {
  // schema defects -> 400
  // route not found -> 404
  // everything else -> 503
});
```

This is another broad central mapper. It can hide missing endpoint/middleware error declarations.

### Refactor target

Prefer first-class Effect HTTP mechanisms:

- schema errors: `HttpApiMiddleware.layerSchemaErrorTransform` if custom behavior is needed;
- route not found: low-level router/not-found handling only;
- expected endpoint errors: declared in endpoint or middleware schemas;
- standard HTTP responses: `HttpApiError.*` inside HTTP adapter code;
- unexpected failures: defects that the router/server handles.

After endpoint and middleware errors are correctly declared, this central mapper should shrink substantially or disappear.

---

## 8. Verisure auth exposes implementation error unions

### File

- `packages/server/src/Verisure/VerisureAuth.ts`

### Current smell

```ts
export type VerisureAuthError =
  | VerisureDomainError
  | VerisureDomainErrorReason
  | CredentialCryptoError
  | RepositoryError
  | VerisureSessionStoreError;
```

Callers of auth should not know that auth uses crypto, repositories, session storage, or low-level Verisure transport reasons.

### Refactor target

Replace with a semantic boundary error:

```ts
export class VerisureAuthMfaRequired extends Schema.TaggedErrorClass<VerisureAuthMfaRequired>()(
  "VerisureAuthMfaRequired",
  { message: Schema.String }
) {}

export class VerisureAuthUnavailable extends Schema.TaggedErrorClass<VerisureAuthUnavailable>()(
  "VerisureAuthUnavailable",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  }
) {}

export class VerisureAuthError extends Schema.TaggedErrorClass<VerisureAuthError>()(
  "VerisureAuthError",
  {
    reason: Schema.Union([VerisureAuthMfaRequired, VerisureAuthUnavailable]),
  }
) {}
```

Then all `VerisureAuthShape` methods fail with only `VerisureAuthError`.

Internal errors collapse locally:

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

MFA becomes semantic:

```ts
return (
  yield *
  new VerisureAuthError({
    reason: new VerisureAuthMfaRequired({
      message: "Verisure requires multifactor authentication",
    }),
  })
);
```

---

## 9. `verisureReason` and low-level `instanceof` lists should disappear

### File

- `packages/server/src/Verisure/VerisureAuth.ts`

### Current smell

```ts
const verisureReason = (error: VerisureAuthError) => {
  if (error instanceof VerisureDomainError) return error.reason;
  return error instanceof AuthenticationError ||
    error instanceof CookieReadError ||
    error instanceof CredentialsRejected ||
    ...
    ? error
    : undefined;
};
```

This exists because raw reasons still leak alongside wrapped `VerisureDomainError`.

### Refactor target

Guarantee one shape at each boundary.

- `VerisureTransport` should fail with `VerisureDomainError` only.
- `VerisureAuth` should translate `VerisureDomainError` into `VerisureAuthError` only.

Then code uses:

```ts
Effect.catchReasons("VerisureDomainError", {
  MFARequired: (e) => ...
}, (e) => ...)
```

or:

```ts
Effect.catchReasons("VerisureAuthError", {
  VerisureAuthMfaRequired: (e) => ...
}, (e) => ...)
```

No normalizer helper. No duplicated `instanceof` schema union.

---

## 10. `updateStatusForError` is a central broad mapper

### File

- `packages/server/src/Verisure/VerisureAuth.ts`

### Current smell

```ts
const updateStatusForError = (error: VerisureAuthError, setStatus: ...) => {
  const reason = verisureReason(error);
  if (reason instanceof MFARequired) ...
  if (reason instanceof AuthenticationError) ...
  if (reason instanceof RateLimitError) ...
  if (reason instanceof LoginError) ...
}
```

This maps low-level implementation errors to credential connection statuses after the fact.

### Refactor target

Update status at semantic decision points.

Example:

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

For unexpected/internal failures, set a coarse error status where the operation fails or in a small `catchReasons("VerisureAuthError", ...)` block that handles only auth-level reasons.

---

## 11. Verisure requests exposes auth/domain/raw reason unions

### File

- `packages/server/src/Verisure/VerisureRequests.ts`

### Current smell

```ts
export type VerisureRequestsError =
  | VerisureAuthError
  | VerisureDomainError
  | VerisureDomainErrorReason;
```

This leaks auth internals and low-level transport/domain reasons to all request consumers.

### Refactor target

Create a semantic request boundary:

```ts
export class VerisureRequestsMfaRequired extends Schema.TaggedErrorClass<VerisureRequestsMfaRequired>()(
  "VerisureRequestsMfaRequired",
  { message: Schema.String }
) {}

export class VerisureRequestsUnavailable extends Schema.TaggedErrorClass<VerisureRequestsUnavailable>()(
  "VerisureRequestsUnavailable",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
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

`VerisureRequestsShape` methods should fail with only `VerisureRequestsError`.

Translate lower-layer errors inline in `executeWithSession`, where the boundary context exists. Avoid helpers like `authErrorToRequestReason`.

---

## 12. `RequestScope.ts` is unused pseudo-middleware with broad union errors

### File

- `packages/server/src/Security/RequestScope.ts`

### Current smell

This file exports higher-order scope providers:

```ts
provideCredentialScope;
provideInstallationScope;
provideDefaultInstallationScope;
```

They are currently not used anywhere else in the repo, and their error channels expose low-level details:

```ts
E | ScopeError | RepositoryError;
E | CredentialCryptoError | ScopeError | VerisureRequestsError;
```

### Refactor target

Either delete this file if it remains unused after the middleware refactor, or convert it into a semantic service that does not expose repository/crypto/request internals.

Example service shape:

```ts
interface CredentialScopeServiceShape {
  readonly authorizeCredential: (
    credentialId: string
  ) => Effect.Effect<
    VerisureCredentialRow,
    CredentialNotFound | ServiceUnavailable,
    CurrentUser
  >;

  readonly authorizeInstallation: (
    giid: string
  ) => Effect.Effect<
    CurrentInstallationShape,
    InstallationNotFound | VerisureMfaRequired | ServiceUnavailable,
    CurrentCredential
  >;
}
```

HTTP/RPC middleware can then translate those semantic errors to transport-specific errors.

---

## 13. RPC scoped middleware uses a shared broad `ScopedRpcError`

### Files

- `packages/contract/src/errors.ts`
- `apps/api/src/Rpc/ScopeMiddleware.ts`

### Current smell

```ts
export const ScopedRpcError = Schema.Union([
  Unauthorized,
  CredentialNotFound,
  InstallationNotFound,
  InvalidInput,
]);
```

Both credential and installation scope middleware declare this same broad error schema:

```ts
error: RpcContract.ScopedRpcError;
```

### Refactor target

Split middleware errors by middleware ownership.

Credential scope middleware should declare only what it can produce:

```ts
const CredentialScopeError = Schema.Union([
  RpcContract.CredentialNotFound,
  RpcContract.InvalidInput,
]);
```

Installation scope middleware should declare only what it can produce:

```ts
const InstallationScopeError = Schema.Union([
  RpcContract.InstallationNotFound,
  RpcContract.InvalidInput,
  RpcContract.MfaRequired, // if represented in RPC contract
  RpcContract.ScopeUnavailable, // if expected for clients
]);
```

Do not include `Unauthorized` in scope middleware; `AuthMiddleware` already owns it.

Because `Rpc.ErrorSchema<R>` includes middleware errors automatically, endpoint RPC definitions should not also include these errors by hand.

---

## 14. RPC middleware maps internal failures to `InvalidInput`

### File

- `apps/api/src/Rpc/ScopeMiddleware.ts`

### Current smell

Credential scope maps repository failure to invalid input:

```ts
RepositoryError: () =>
  Effect.fail(
    new RpcContract.InvalidInput({
      message: "Unable to load credential scope",
    })
  );
```

Installation scope maps non-installation errors into `InvalidInput`:

```ts
Effect.mapError((error) =>
  error instanceof RpcContract.InstallationNotFound
    ? error
    : new RpcContract.InvalidInput({
        message:
          error._tag === "CredentialCryptoError"
            ? "Credential material is invalid"
            : "Unable to load installation scope",
      })
);
```

Internal service failures are not invalid client input.

### Refactor target

Use semantic service errors first, then translate to RPC errors.

Options:

- if clients should handle scope load failure, add a specific RPC error like `ScopeUnavailable`;
- otherwise defect unexpected/internal failures with `Effect.die` so they are not part of the expected RPC contract.

Do not classify repository/crypto/upstream failures as `InvalidInput`.

---

## 15. RPC contracts manually include middleware errors in endpoint error schemas

### Files

- `packages/contract/src/alarm.ts`
- `packages/contract/src/device.ts`
- `packages/contract/src/credential.ts`
- `packages/contract/src/installation.ts`
- `packages/contract/src/shortcut.ts`
- `packages/contract/src/auth.ts`

### Current smell

Example from `alarm.ts`:

```ts
const AlarmReadError = Schema.Union([
  Unauthorized,
  CredentialNotFound,
  InstallationNotFound,
  InvalidInput,
  AlarmUnavailable,
]);
```

But `Unauthorized`, `CredentialNotFound`, `InstallationNotFound`, and `InvalidInput` are produced by auth/scope middleware, not by the alarm endpoint itself.

Effect RPC already includes middleware errors:

```ts
export type ErrorSchema<R> = _Error | _Middleware["error"];
```

### Refactor target

Base RPC contracts should declare only endpoint-local expected errors.

Example:

```ts
Rpc.make("GetArmState", {
  payload: AlarmStatusPayload,
  success: ArmStateSchema,
  error: AlarmUnavailable, // endpoint-local service failure only if expected
});
```

Command endpoints:

```ts
Rpc.make("ToggleFullAlarm", {
  payload: AlarmCommandPayload,
  success: AlarmMutationResult,
  error: Schema.Union([AlarmCodeRequired, AlarmUnavailable]),
});
```

Auth/scope errors come from:

```ts
RpcContract.AlarmRpcs.middleware(InstallationScopeMiddleware)
  .middleware(CredentialScopeMiddleware)
  .middleware(AuthMiddleware);
```

If clients need a pre-composed authenticated contract type, export a composed contract separately instead of baking middleware errors into every base RPC.

---

## 16. RPC contract has domain-specific unavailable errors per feature

### File

- `packages/contract/src/errors.ts`

### Current smell

```ts
DeviceReadUnavailable;
AlarmUnavailable;
CredentialUnavailable;
InstallationUnavailable;
ShortcutUnavailable;
```

Some of these may be useful endpoint-local product errors, but many may just be feature-specific wrappers around the same internal service availability failure.

### Refactor target

Re-evaluate each one:

- If clients have different recovery behavior per feature, keep the specific RPC error.
- If clients only show a generic failure, replace with one generic RPC `ServiceUnavailable` or treat internal service unavailability as a defect.

Do not keep feature-specific unavailable errors just to preserve naming symmetry.

---

## 17. Public service error aliases still use TypeScript unions

### Files

- `packages/server/src/Services/AlarmService.ts`
- `packages/server/src/Services/InstallationService.ts`

### Current smell

```ts
export type AlarmCommandError = AlarmCodeRequired | ServiceUnavailable;
export type InstallationServiceError = CredentialNotFound | ServiceUnavailable;
```

These are small, but they are still exported boundary aliases.

### Refactor target

Either inline the concrete errors directly in method signatures if the alias does not add meaning, or introduce a real service boundary error only where a wrapper provides semantic value.

Do not create a broad `ApplicationError` or feature wrapper just for style. The goal is smaller, clearer boundaries.

---

## 18. Tests still assert old wrapped/raw error shapes

### Files

- `packages/server/src/Verisure/VerisureAuth.test.ts`
- `packages/server/src/Verisure/VerisureTransport.test.ts`
- `apps/api/src/Http/RestApi.test.ts`

### Current smell

Tests currently contain compatibility checks for transitional shapes, e.g.:

```ts
error instanceof VerisureDomainError ? error.reason : error;
```

and REST tests expect custom shortcut error tags.

### Refactor target

After boundary refactors:

- transport tests should assert `VerisureDomainError` with a specific `reason`;
- auth tests should assert `VerisureAuthError` with auth-level reasons only;
- request tests should assert `VerisureRequestsError` with request-level reasons only;
- REST tests should assert standard HTTP errors/statuses plus only remaining custom product errors.

No transitional raw-or-wrapped assertions should remain.

---

## Suggested implementation order

1. **RPC contracts and middleware inference**
   - Remove middleware-owned errors from RPC endpoint schemas.
   - Split `ScopedRpcError` by middleware.
   - Update RPC handlers/tests.

2. **Verisure auth/request boundaries**
   - Replace `VerisureAuthError` type union.
   - Remove `verisureReason`.
   - Remove `updateStatusForError` central mapper.
   - Replace `VerisureRequestsError` type union.

3. **Shortcut REST HTTP errors**
   - Replace custom standard HTTP errors with `HttpApiError.*`.
   - Remove `ShortcutRestErrorSchemas`.
   - Update tests.

4. **Shortcut REST middleware composition**
   - Replace `provideShortcutAlarmScope` with real `HttpApiMiddleware` chain.
   - Move `giid` to route params so middleware can provide `CurrentInstallation`.
   - Shrink handlers.

5. **Remove dead helpers**
   - Delete unused `RequestScope.ts` helpers or replace with semantic services.
   - Run `bun fix`, `bun check`, and `bun run test`.
