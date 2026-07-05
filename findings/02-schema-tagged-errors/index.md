# 02 — Application errors are mostly not schema-backed

## What's wrong

Most project errors use `Data.TaggedError`. Effect's current application examples and HTTP fixtures use `Schema.TaggedErrorClass`, especially when errors cross API/RPC/HTTP boundaries or need structured data.

References from `repos/effect`:

- `repos/effect/LLMS.md` — examples define custom errors with `Schema.TaggedErrorClass`.
- `repos/effect/ai-docs/src/01_effect/03_errors/01_error-handling.ts` — custom errors are schema-tagged and then handled with `Effect.catchTag` / `Effect.catchTags`.
- `repos/effect/ai-docs/src/51_http-server/fixtures/domain/UserErrors.ts` — domain errors are `Schema.TaggedErrorClass`, including a reason-wrapper error.
- `repos/effect/ai-docs/src/51_http-server/fixtures/api/Authorization.ts` — HTTP API errors are schema-tagged with status annotations.

`Data.TaggedError` does appear in lower-level Effect tests/platform modules, so it is not forbidden. The mismatch is that our domain/application API error model is closer to the schema-first examples than to a platform-internal error type.

## Concrete examples in our code

### Domain errors

`packages/domain/src/errors.ts` defines cross-package domain failures as `Data.TaggedError`:

```ts
export class RequestError extends Data.TaggedError("RequestError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
```

The Effect HTTP/domain fixtures prefer schema-backed errors:

```ts
export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 }
) {}
```

### Server/service errors

Additional app-level errors also use `Data.TaggedError`:

- `packages/server/src/Repositories/RepositoryError.ts`
- `packages/server/src/Services/ServiceError.ts`
- `packages/server/src/Services/ApiTokenService.ts` (`ApiTokenError`)
- `packages/server/src/Auth/BetterAuthService.ts` (`AuthError`)
- `packages/server/src/Email/EmailService.ts` (`EmailError`)
- `packages/server/src/Security/CredentialCrypto.ts` (`CredentialCryptoError`)
- `packages/server/src/Security/RequestContext.ts` (`ScopeError`)
- `packages/server/src/Verisure/VerisureSessionStore.ts`

## Why it matters

- Schema-backed errors are serializable/decodable and align with `HttpApi`, RPC contracts, and API documentation generation.
- Effect's fixtures attach HTTP status metadata directly to schema errors, reducing central ad-hoc mapping.
- Structured schemas make the error surface clearer and safer than arbitrary `unknown` or optional unvalidated fields.
- A reason-wrapper shape like `UsersError` in the Effect fixtures can model high-level service errors while preserving machine-readable reasons.

## Preferred shape

For boundary-crossing domain/API errors:

```ts
export class ResponseError extends Schema.TaggedErrorClass<ResponseError>()(
  "ResponseError",
  {
    message: Schema.String,
    statusCode: Schema.Number,
    text: Schema.String,
  }
) {}
```

For grouped service failures, consider the reason pattern from Effect's HTTP fixture:

```ts
export class VerisureError extends Schema.TaggedErrorClass<VerisureError>()(
  "VerisureError",
  { reason: Schema.Union(AuthenticationFailed, RateLimited, BadResponse) }
) {}
```

Use `Schema.Defect()` or explicit nested schemas for causes instead of broad `unknown` when the error crosses a boundary.
