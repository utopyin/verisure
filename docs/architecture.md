# Verisure Effect HTTP Server Architecture

This document describes the current architecture of the Verisure server after the Effect-native HTTP/RPC refactor. It is intentionally implementation-facing: use it to understand file boundaries, dependency direction, layer wiring, request flow, and error semantics.

## Goals

- Run a Cloudflare Worker backend with Effect services and Alchemy-managed infrastructure.
- Use Effect RPC for the dashboard API and Effect `HttpApi` for the public Shortcut REST API.
- Keep contracts schema-first and route/middleware composition builder-style.
- Keep service errors semantic and transport-free; HTTP/RPC adapters translate service errors at the edge.
- Keep Verisure upstream details isolated behind `VerisureTransport`, `VerisureAuth`, and `VerisureRequests`.
- Store Better Auth data, encrypted Verisure credentials, hashed API tokens, and shortcut export records in D1.
- Store Verisure session snapshots/MFA state in a per-credential Durable Object.

## Runtime surfaces

| Surface       | Path              | Auth               | Implementation                                   | Purpose                                    |
| ------------- | ----------------- | ------------------ | ------------------------------------------------ | ------------------------------------------ |
| Health        | `GET /api/health` | none               | `apps/api/src/Http/Routes.ts`                    | Worker health check                        |
| Better Auth   | `/api/auth/*`     | Better Auth        | `BetterAuthService.fetch` mounted by `Routes.ts` | magic-link login, callback, session routes |
| Dashboard RPC | `/api/rpc/*`      | Better Auth cookie | `RpcServer.toHttpEffect` in `Http/RpcMount.ts`   | typed dashboard API                        |
| Shortcut REST | `/api/v1/*`       | bearer API token   | `HttpApiBuilder.layer` in `Http/RestApi.ts`      | iPhone Shortcuts / automations             |

The Worker entrypoint is `apps/api/src/worker.ts`. It resolves `ApiHttpApp` from `ApiWorkerLayer` and returns a Web `fetch` handler.

## Cloudflare and Alchemy resources

`alchemy.run.ts` is the source of truth for app deployment:

```text
Alchemy.Stack("Verisure")
├── Cloudflare.providers()
├── Drizzle.providers()
├── Cloudflare.state()
├── @verisure/db/cloudflare:D1Database("AppDb")
├── apps/web/src/Web.ts                  Cloudflare.Website.Vite("Web")
├── apps/api/src/worker.ts               Cloudflare.Worker("ApiWorker")
└── production only:
    └── Workers.WorkerRoute("ApiRoute")  verisure.utopy.sh/api/*
```

Infrastructure bindings used by the API layer:

- D1 query binding through `Cloudflare.D1.QueryDatabaseBinding`.
- Durable Object namespace for `VerisureSessionObject`.
- Runtime config via `effect/Config`:
  - `APP_BASE_URL` defaulting to `https://verisure.utopy.sh`.
  - `BETTER_AUTH_SECRET`.
  - `CREDENTIAL_ENCRYPTION_KEY`.
  - optional `TOKEN_PEPPER`.
  - optional `CLOUDFLARE_EMAIL_FROM`.
  - optional `VERISURE_EMAIL_DRIVER`, defaulting to `console`; set to `cloudflare` to use Cloudflare Email Send.
  - optional `VERISURE_APPLICATION_ID`.
  - optional comma-separated `VERISURE_BASE_URLS`.
- Cloudflare Email Send binding through `Cloudflare.Email.SendEmail("Email")` in `packages/server/src/Email/CloudflareEmailLive.ts` when `EmailLive` selects the `cloudflare` driver.
- Browser/Web Crypto via `@effect/platform-browser/BrowserCrypto`.

`apps/api/src/layers/Infrastructure.ts` also provides KV and Workers RateLimit bindings for Cloudflare compatibility/future use, but the current business services do not depend on KV or a rate-limit service.

## Current package layout

```text
.
├── alchemy.run.ts
├── apps/
│   ├── api/                                # @verisure/api, Cloudflare Worker adapter
│   │   └── src/
│   │       ├── worker.ts                   # Worker resource / fetch export
│   │       ├── SessionObject.ts            # Durable Object implementation
│   │       ├── SessionStoreLive.ts         # VerisureSessionStore backed by Durable Object
│   │       ├── Http/
│   │       │   ├── Routes.ts               # top-level low-level router
│   │       │   ├── RpcMount.ts             # Effect RPC mounted as HTTP
│   │       │   ├── RestApi.ts              # Shortcut HttpApiBuilder layer -> HttpRouter
│   │       │   ├── ShortcutApi.ts          # schema-first REST contract
│   │       │   ├── ShortcutHandlers.ts     # REST handlers
│   │       │   ├── ShortcutMiddleware.ts   # HttpApiMiddleware auth/scope layers
│   │       │   ├── ShortcutErrors.ts       # product-specific REST errors only
│   │       │   └── RestApi.test.ts
│   │       ├── Rpc/
│   │       │   ├── index.ts                # composed runtime RPC group + handlers layer
│   │       │   ├── AuthMiddleware.ts       # provides CurrentUser
│   │       │   ├── ScopeMiddleware.ts      # provides CurrentCredential/CurrentInstallation
│   │       │   ├── *Handlers.ts            # per-RPC-group adapters
│   │       │   └── index.test.ts
│   │       └── layers/
│   │           ├── Infrastructure.ts
│   │           ├── Persistence.ts
│   │           ├── Application.ts
│   │           └── index.ts
│   └── web/                                # @verisure/web, Alchemy Vite site
│       └── src/
│           ├── Web.ts
│           ├── main.ts
│           ├── routes/
│           ├── components/
│           └── shortcut-export/
└── packages/
    ├── db/                                 # D1/Drizzle schema and Database layer
    │   └── src/{schema,database,drizzle,cloudflare}.ts
    ├── domain/                             # pure DTOs, cookies, low-level Verisure errors
    │   └── src/{dto,cookies,errors}.ts
    ├── graphql-client/                     # pure GraphQL operation builder helpers
    ├── interface/                          # shared interface/entity shapes
    ├── rpc-contract/                       # Effect RPC contracts and RPC error schemas
    │   └── src/{errors,rpcs,rpcs/*}.ts
    ├── server/                             # transport-free application services
    │   └── src/
    │       ├── Auth/BetterAuthService.ts
    │       ├── Email/*
    │       ├── Repositories/*
    │       ├── Runtime/RuntimeConfig.ts
    │       ├── Security/{CredentialCrypto,RequestContext}.ts
    │       ├── Services/*
    │       └── Verisure/*
    ├── shared/                             # shared cookie helpers
    └── test/                               # shared test utilities
```

Deleted/obsolete architecture names: `Http/App.ts`, `Http/BetterAuthMount.ts`, `Http/RouteScopes.ts`, web `rpc/client.ts`, web `rpc/query.ts`, web `rpc/mutations.ts`, and server `Security/RequestScope.ts` are no longer part of the codebase.

## Dependency direction

```text
apps/web ────────────────┐
                         ├── packages/rpc-contract ─── packages/domain
apps/api ────────────────┘             ▲
        │                              │
        ├── packages/server ───────────┤
        ├── packages/db ───────────────┘
        └── packages/interface

packages/server ─── packages/db, packages/domain, packages/interface,
                    packages/graphql-client, packages/shared
packages/db     ─── Drizzle / D1 only
packages/domain ─── Effect Schema + pure helpers only
```

Rules:

- `packages/domain` must stay pure: no RPC, HTTP, Cloudflare, Better Auth, D1, or application services.
- `packages/rpc-contract` declares schemas and expected RPC errors only; it must not import server/db/Cloudflare/Better Auth/TanStack.
- `packages/server` exposes transport-free services. It may depend on db/domain/interface/shared/graphql-client, but not on HTTP/RPC adapter errors.
- `apps/api` is the adapter layer. It maps service errors to HTTP/RPC contract errors.
- `apps/web` must use RPC contracts/client code, not server internals.

## Layer graph

```text
ApiWorkerLayer
├── InfrastructureLayer
│   ├── D1 QueryDatabase binding
│   ├── VerisureSessionObjectLive
│   ├── RuntimeConfig.Live
│   ├── BrowserCrypto layer
│   ├── KV binding                 # currently not business-critical
│   └── Workers RateLimit binding  # currently not business-critical
└── ApplicationLayer
    ├── ApiHttpAppLive
    │   └── ApiHttpRoutes
    │       ├── /api/health        static JSON
    │       ├── /api/auth/*        BetterAuthService.fetch
    │       ├── /api/rpc/*         DashboardRpcHttp
    │       ├── /api/v1/*          ShortcutRestHttp
    │       └── *                  404 JSON fallback
    ├── ApplicationServicesLayer
    │   ├── Server.ApplicationServicesLive
    │   │   ├── AlarmService.Live
    │   │   ├── ApiTokenService.Live
    │   │   ├── CredentialService.Live
    │   │   ├── DeviceService.Live
    │   │   ├── InstallationService.Live
    │   │   └── ShortcutExportService.Live
    │   └── BetterAuthService.Live
    └── PersistenceLayer
        ├── RepositoryLive
        ├── VerisureSessionStoreLive
        └── DatabaseLive
```

`Server.ApplicationServicesLive` additionally provides:

```text
CredentialCrypto.Live
VerisureRequests.Live
└── VerisureAuth.Live
    ├── CredentialRepository
    ├── CredentialCrypto
    ├── VerisureSessionStore
    └── VerisureTransport.Live
        └── FetchHttpClient.layer
```

## Request context model

Request-scoped services remove repeated arguments from service APIs:

- `CurrentUser` identifies the authenticated dashboard/API-token principal.
- `CurrentCredential` identifies the selected Verisure credential row.
- `CurrentInstallation` provides the selected `giid`.

Providers:

- Dashboard RPC:
  - `AuthMiddleware` provides `CurrentUser` from Better Auth session headers.
  - `CredentialScopeMiddleware` reads `credentialId` from the RPC payload, verifies ownership, and provides `CurrentCredential`.
  - `InstallationScopeMiddleware` reads `giid` from the RPC payload, verifies membership through Verisure, and provides `CurrentInstallation`.
- Shortcut REST:
  - `ShortcutAuthorization` validates the decoded bearer credential and provides `ShortcutBearerToken`.
  - `ShortcutApiTokenPrincipal` authenticates the token and provides `CurrentUser`, `CurrentCredential`, and token metadata.
  - `ShortcutAlarmReadAccess` / `ShortcutAlarmWriteAccess` read `:giid` route params, check token scope/allowed GIIDs, verify installation membership, and provide `CurrentInstallation`.

Services such as `AlarmService` and `DeviceService` consume these context tags instead of accepting `userId`, `credentialId`, and `giid` parameters.

## Shortcut REST API

Shortcut REST is defined schema-first in `apps/api/src/Http/ShortcutApi.ts` and implemented with `HttpApiBuilder` in `ShortcutHandlers.ts`. Middleware is declared through `HttpApiMiddleware`; middleware errors are inferred by Effect HTTP and should not be repeated on every endpoint.

Current endpoints:

| Method | Path                                            | Body                  |
| ------ | ----------------------------------------------- | --------------------- | ------------ | -------------------------------- |
| `GET`  | `/api/v1/installations/:giid/alarm/status`      | none                  |
| `POST` | `/api/v1/installations/:giid/alarm/toggle-full` | `{ "code"?: string }` |
| `POST` | `/api/v1/installations/:giid/alarm/mode`        | `{ "mode": "DISARMED" | "ARMED_AWAY" | "ARMED_HOME", "code"?: string }` |

Route params are intentional: authorization middleware owns installation access and can read `:giid` without decoding endpoint payloads.

Shortcut HTTP errors:

- Standard HTTP failures use Effect built-ins such as `HttpApiError.UnauthorizedNoContent`, `ForbiddenNoContent`, `NotFoundNoContent`, `BadRequestNoContent`, and `ServiceUnavailableNoContent`.
- The only product-specific Shortcut REST error is `ShortcutMfaRequired` (`409`) because MFA is a public protocol state.
- Schema decode errors use Effect’s default `HttpApiSchemaError` response behavior; no custom schema-error middleware is needed.
- Internal failures should die as respondable defects or be logged by the server layer, not expand endpoint expected-error channels.

`RestApi.ts` converts nested router causes through `HttpServerError.causeResponse`, preserving respondable failures/defects from the `HttpApi` router when mounted under the top-level router.

## Dashboard RPC API

The base RPC contract lives in `packages/rpc-contract/src/rpcs/*`. Runtime middleware is attached in `apps/api/src/Rpc/*Handlers.ts`.

RPC groups:

- `AuthRpcs`: `GetSession`, `Logout`.
- `CredentialRpcs`: list/create/delete credentials, request/validate MFA.
- `InstallationRpcs`: list installations and set default installation.
- `AlarmRpcs`: get arm state, arm away/home, disarm, set/toggle alarm mode.
- `DeviceRpcs`: door/window, climate, smart locks, smart plugs.
- `ShortcutRpcs`: export shortcuts, list/revoke API tokens.

RPC error rules:

- Base RPC endpoints declare only endpoint-local expected errors.
- `AuthMiddleware` owns `Unauthorized`.
- `CredentialScopeMiddleware` owns `CredentialNotFound | InvalidInput`.
- `InstallationScopeMiddleware` owns `InstallationNotFound | InvalidInput`.
- Service failures exposed to clients use the generic `ServiceUnavailable` unless the client has a more specific recovery path.
- Internal decode/invariant failures die instead of being mapped to expected RPC errors.

`apps/api/src/Rpc/index.ts` composes runtime RPC groups and handler layers, then `Http/RpcMount.ts` exposes them with `RpcServer.toHttpEffect` and NDJSON serialization.

## Service model

The server package has three layers of services.

### Infrastructure-facing services

- `RuntimeConfig` reads Effect config and secrets.
- `EmailService` abstracts email delivery; `EmailLive` selects `CloudflareEmailLive` when `VERISURE_EMAIL_DRIVER=cloudflare` and otherwise uses `ConsoleEmailLive`.
- `VerisureSessionStore` abstracts credential-scoped Verisure session persistence. The server package includes an in-memory implementation for tests; `apps/api/src/SessionStoreLive.ts` provides the Durable Object implementation.
- Repositories wrap D1 access behind semantic repository APIs and `RepositoryError`.

### Application services

- `BetterAuthService` owns Better Auth setup and `/api/auth/*` handling.
- `CredentialCrypto` encrypts/decrypts user-managed Verisure credentials.
- `CredentialService`, `InstallationService`, `AlarmService`, `DeviceService`, `ApiTokenService`, and `ShortcutExportService` expose business behavior with small semantic error channels.

### Verisure integration services

- `VerisureTransport` owns raw Verisure HTTP requests, `automation01`/`automation02` failover, HTTP classification, GraphQL execution, and low-level `VerisureDomainError` wrapping.
- `VerisureAuth` owns login/session/refresh/MFA flows and credential connection status updates. Its public error is `VerisureAuthError` with semantic reasons (`VerisureAuthMfaRequired` or `VerisureAuthUnavailable`).
- `VerisureRequests` owns authenticated GraphQL operations. Its public error is `VerisureRequestsError` with semantic reasons (`VerisureRequestsMfaRequired` or `VerisureRequestsUnavailable`).

Service callers should not handle repository, crypto, session-store, GraphQL, HTTP-client, or transport internals directly.

## Error taxonomy and boundaries

Error boundaries are intentionally layered.

```text
packages/domain
└── low-level Verisure protocol/transport classifications
    RequestError | AuthenticationError | MFARequired | CookieReadError |
    CredentialsRejected | LoginError | RateLimitError | LogoutError |
    ResponseError | GraphQLError
    wrapped as VerisureDomainError at the transport boundary

packages/server/Verisure
├── VerisureAuthError
│   └── VerisureAuthMfaRequired | VerisureAuthUnavailable
└── VerisureRequestsError
    └── VerisureRequestsMfaRequired | VerisureRequestsUnavailable

packages/server/Services
└── semantic application errors
    ServiceUnavailable | AlarmCodeRequired | CredentialNotFound |
    ApiTokenNotFound | ApiTokenUnauthorized | ApiTokenForbidden

apps/api HTTP/RPC adapters
├── HttpApiError.* and ShortcutMfaRequired for REST
└── rpc-contract errors for dashboard RPC
```

Rules:

- Do not expose HTTP or RPC errors from `packages/server`.
- Do not expose repository/crypto/session/GraphQL/transport errors from application services.
- Do not create broad app-wide error unions or central mappers.
- Endpoint/RPC handlers translate only the semantic errors they actually expect.
- Unexpected/internal failures become defects or coarse unavailable errors at the nearest correct boundary.
- Middleware errors are inferred; endpoint contracts declare only endpoint-local failures.

## Data model

D1/Drizzle stores Better Auth tables and application tables:

- Better Auth: `user`, `session`, `account`, `verification`.
- `verisure_credential`: encrypted Verisure email/password/PIN, connection status, default `giid`, timestamps, and MFA/status metadata.
- `api_token`: hashed Shortcut API tokens, display prefix, scopes, optional allowed GIIDs, expiry/revocation/last-used metadata.
- `shortcut_export`: shortcut export audit records linked to credential and API token.

Connection status values are:

```text
unchecked | connected | mfa_required | auth_failed | rate_limited | error
```

Plaintext API tokens are generated once, returned to the user/shortcut export response, and never stored. Token hashes can be peppered with `TOKEN_PEPPER`.

## Shortcut templates

`ShortcutExportService` supports two templates:

- `toggle-full`: reads `/api/v1/installations/:giid/alarm/status`; if `ARMED_AWAY`, calls mode `DISARMED`; otherwise calls mode `ARMED_AWAY`.
- `choose-mode`: presents a Shortcuts menu and calls `/api/v1/installations/:giid/alarm/mode` with the selected mode.

The export response contains the API URL, generated bearer token, credential ID, optional GIID, instructions, and template metadata. Shortcut file generation/download URLs remain optional; the stable fallback is guided setup with the generated token and API URL.

## Key call graphs

### Dashboard alarm query through RPC

```text
Dashboard client
└── DashboardRpcs.Alarm.GetArmState({ credentialId, giid })
    └── POST /api/rpc/*
        └── AuthMiddleware provides CurrentUser
            └── CredentialScopeMiddleware provides CurrentCredential
                └── InstallationScopeMiddleware provides CurrentInstallation
                    └── AlarmService.getArmState
                        └── VerisureRequests.armState
                            ├── VerisureAuth.ensureSession
                            └── VerisureTransport.executeGraphQL
```

### Shortcut alarm command

```text
POST /api/v1/installations/:giid/alarm/mode
Authorization: Bearer <api-token>
└── ShortcutAuthorization provides ShortcutBearerToken
    └── ShortcutApiTokenPrincipal authenticates token
        └── ShortcutAlarmWriteAccess checks scope + allowed GIIDs + installation membership
            └── AlarmService.setMode({ mode, code? })
                ├── use request code or decrypt credential PIN
                └── VerisureRequests.setAlarmMode
                    ├── VerisureAuth.ensureSession
                    └── VerisureTransport.executeGraphQL
```

### Magic-link login

```text
/api/auth/*
└── BetterAuthService.fetch
    ├── Better Auth reads/writes D1 tables
    └── magic-link email callback
        └── EmailService.send
            └── Cloudflare Email Send or console/test implementation
```

### Verisure session refresh/login

```text
VerisureAuth.ensureSession
└── VerisureSessionStore.withCredentialLock
    ├── read CurrentCredential and decrypt email/password
    ├── if valid session snapshot exists: return it
    ├── else if refresh cookies exist: GET /auth/token
    ├── else if trust cookie exists: POST /auth/login with trust cookie
    └── else POST /auth/login with basic auth
        ├── if MFA step-up is required: store MFA state and fail VerisureAuthMfaRequired
        └── verify by fetching installations and persist connected status
```

### Verisure host failover

```text
VerisureTransport.request
├── order base URLs with remembered preferred host first
├── try automation01/automation02 or configured VERISURE_BASE_URLS
├── fail over on network errors, 5xx responses, or SYS_00004-like response errors
├── classify 401/403 as AuthenticationError
├── classify 429/rate-limit response text as RateLimitError
└── wrap low-level reasons as VerisureDomainError
```

## Session storage

The Durable Object replaces Python-style cookie files and serializes per-credential session mutation.

```ts
type SessionCookie = {
  readonly name: string;
  readonly value: string;
  readonly domain?: string;
  readonly path?: string;
  readonly expires?: number;
};

type SessionSnapshot = {
  readonly cookies: readonly SessionCookie[];
  readonly trustToken?: {
    readonly trustTokenValue: string;
    readonly expiresAt?: number;
  };
  readonly preferredBaseUrl?: string;
  readonly authenticatedAt: number;
  readonly expiresAt: number;
};

type SessionMfaState = {
  readonly requestedAt: number;
  readonly cookies: readonly SessionCookie[];
};
```

`apps/api/src/SessionObject.ts` stores:

- `snapshot`
- `mfa`
- `lock`

`apps/api/src/SessionStoreLive.ts` uses `VerisureSessionObject.getByName(CurrentCredential.id)` so each credential has an isolated session object.

## Testing strategy

- Domain tests cover cookie helpers and low-level Verisure error classification.
- Server tests cover services, token behavior, shortcut export, Verisure transport, Verisure auth, and session store behavior with layers/stubs.
- RPC contract tests verify group composition and middleware-free base contracts.
- API tests cover RPC middleware behavior and Shortcut REST behavior.
- Validation gate:
  - `bun fix` for formatting/lint fixes.
  - `bun check` for Turborepo typecheck, lint, and Knip dead-code checks.
  - `bun run test` for Vitest/turborepo test suites. Do not use `bun test` directly for project tests.

## Key design decisions

1. **D1/Drizzle for app data**: Better Auth and application tables share D1.
2. **Effect Config for secrets**: Alchemy records and binds `Config.redacted` values as Worker secrets.
3. **Dedicated EmailService**: Better Auth depends on email delivery, but email remains an infrastructure service.
4. **Context tags for scoped requests**: middleware provides `CurrentUser`, `CurrentCredential`, and `CurrentInstallation`.
5. **RPC for dashboard, REST for Shortcuts**: Effect RPC powers the dashboard; bearer-token REST powers iPhone Shortcuts.
6. **Durable Object for Verisure sessions**: per-credential session storage and locking prevents refresh races.
7. **Schema-first contracts**: RPC and REST contracts are declared before handlers.
8. **Middleware owns request-derived context**: auth/scope state derived from headers/payload/route params belongs in middleware.
9. **Transport owns upstream details**: services do not know about Verisure host failover, GraphQL response shape, or HTTP classification.
10. **Minimal semantic error channels**: services expose scarce semantic errors; adapters translate to HTTP/RPC expected errors; defects remain defects.
11. **No central broad mappers**: error handling is endpoint-local or middleware-local.
12. **Alchemy owns Cloudflare wiring**: `alchemy dev/deploy` is the source of truth for Worker, Vite site, D1, route, Durable Object, and email bindings.
