# Verisure Effect HTTP Server Architecture

This document designs an Effect-first HTTP server for reading and controlling Verisure alarm state. It is inspired by `repos/verisure-python/verisure/session.py`, but adapted for Cloudflare Workers / workerd, deployed through Alchemy, and fronted by a TanStack Start dashboard.

## Goals

- Model boundaries as Effect services: auth, email, config, persistence, Verisure transport, Verisure sessions, RPC, REST, and domain actions.
- Run in workerd with Web `fetch`; no Node filesystem and no Python-style cookie file.
- Use Alchemy as the source of truth for dev, deploy, Cloudflare resources, custom domains, and secret/config binding.
- Preserve the Python implementation's Verisure protocol behavior: `automation01`/`automation02` failover, `/auth/*`, `/graphql`, MFA/trust cookies, `SYS_00004` failover, and structured upstream errors.
- Use typed Effect RPC for dashboard calls and simple bearer-token REST endpoints for iPhone Shortcuts.

## Cloudflare and Alchemy resources

Alchemy should bind secrets through `effect/Config`, not through a Secrets Store by default. A `Config.redacted("NAME")` yielded in Worker init, or placed in Worker `env`, is recorded by Alchemy and bound as Cloudflare `secret_text`. Only use `Cloudflare.SecretsStore` if the app specifically needs a runtime Secrets Store binding.

Application state lives in Cloudflare D1 via Drizzle. D1 stores Better Auth data, encrypted Verisure credentials, API token hashes, and shortcut export audit rows. R2 is not needed for this design unless shortcut files later need object storage.

```text
Alchemy.Stack("Verisure")
├── Cloudflare.providers()
├── Drizzle.providers()
├── Cloudflare.state()
├── Config.redacted("BETTER_AUTH_SECRET")
├── Config.redacted("CREDENTIAL_ENCRYPTION_KEY")
├── Config.redacted("TOKEN_PEPPER")
├── Cloudflare.D1Database("AppDb")
├── Cloudflare.SendEmail("Email")
├── Cloudflare.DurableObjectNamespace("VerisureSessionObject")
├── Cloudflare.KVNamespace("VerisureCache")        # optional status/installations cache
├── Cloudflare.RateLimit("VerisureApiLimit")
├── Cloudflare.Vite("Web")                         # apps/web, TanStack Start
└── Cloudflare.Worker("Api")                       # apps/api, backend worker
    ├── verisure.utopy.sh/api/*
    ├── /api/auth/*        Better Auth
    ├── /api/rpc/*         Effect RPC
    ├── /api/v1/*          Shortcut REST API
    └── /api/health
```

Custom-domain routing should use the local Alchemy branch with Worker route support so the public backend surface is `https://verisure.utopy.sh/api/*`, with RPC mounted at `https://verisure.utopy.sh/api/rpc/*`.

## Service model

The service model has three kinds of services:

1. **Infrastructure services** wrap Cloudflare or platform resources. `DbLive` wraps Drizzle/D1, `EmailServiceLive` wraps Cloudflare SendEmail, `RuntimeConfigLive` resolves Effect Config, `FetchHttpClientLive` wraps Web fetch, and `VerisureSessionStoreLive` wraps the Durable Object binding. These should follow Alchemy's infrastructure-layer pattern: the contract is cloud-agnostic, while the live layer declares/binds Cloudflare resources.
2. **Application services** implement business behavior. `BetterAuthService` owns Better Auth setup and route handling; `CredentialCrypto`, `CredentialRepository`, `ApiTokenRepository`, `ShortcutExportService`, `VerisureAuth`, `VerisureGraphQL`, `AlarmService`, `InstallationService`, and `DeviceService` are Effect services with testable interfaces.
3. **Request context tags** remove argument plumbing. HTTP/RPC middleware provides `CurrentUser`, `CurrentCredential`, and `CurrentInstallation`. Alarm/device/installation services read those tags instead of accepting repeated `(principal, credentialId, giid)` parameters.

`EmailService` is intentionally separate from `BetterAuthService`. Better Auth needs an email callback for magic links, but email delivery is complex enough to be its own service. `BetterAuthServiceLive` should resolve its Better Auth config in an Effect that yields `EmailService`, so auth config can send magic links without leaking Cloudflare SendEmail details.

User-managed Verisure credentials are not deploy-time secrets. They are encrypted at rest with `CREDENTIAL_ENCRYPTION_KEY` in D1 and decrypted only inside credential-scoped services. API tokens are shown once, stored only as hashes, and optionally peppered with `TOKEN_PEPPER`.

## Layer graph

The web app and API are separate apps, but the API Worker is the single backend entrypoint for auth, RPC, and Shortcut REST.

```text
WebLive (Cloudflare.Vite / apps/web)
└── TanStack Start dashboard
    ├── Effect RPC client targeting /api/rpc
    └── TanStack Query wrappers

ApiWorkerLive (Cloudflare.Worker / apps/api)
└── HttpAppLive
    ├── BetterAuthMountLive (/api/auth/*)
    │   └── BetterAuthServiceLive
    │       ├── DbLive ────────────── Cloudflare.D1ConnectionLive
    │       ├── EmailServiceLive ─── Cloudflare.SendEmailBindingLive
    │       └── RuntimeConfigLive ── Config.redacted/string
    ├── RpcMountLive (/api/rpc/*)
    │   ├── DashboardAuthMiddlewareLive          provides CurrentUser
    │   ├── CredentialScopeMiddlewareLive        provides CurrentCredential
    │   ├── InstallationScopeMiddlewareLive      provides CurrentInstallation
    │   └── DashboardHandlersLive
    ├── ShortcutRestRoutesLive (/api/v1/*)
    │   ├── ApiTokenMiddlewareLive               provides CurrentUser/CurrentCredential
    │   └── ShortcutAlarmRoutesLive
    ├── Verisure services
    │   ├── VerisureAuthLive
    │   ├── VerisureGraphQLLive
    │   ├── VerisureTransportLive
    │   └── VerisureSessionStoreLive ─── DurableObjectSessionBindingLive
    ├── Db-backed repositories
    ├── ErrorMappingMiddlewareLive
    ├── RateLimitMiddlewareLive
    └── RequestLoggingMiddlewareLive
```

## HTTP and RPC surface

Dashboard-to-backend calls should use Effect RPC. The REST API remains the stable automation surface for iPhone Shortcuts and other non-TypeScript clients.

| Surface       | Path              | Auth               | Purpose                                     |
| ------------- | ----------------- | ------------------ | ------------------------------------------- |
| Health        | `GET /api/health` | none               | Worker health check                         |
| Better Auth   | `/api/auth/*`     | Better Auth        | magic-link login, callback, logout, session |
| Dashboard RPC | `POST /api/rpc`   | Better Auth cookie | typed dashboard API                         |
| Shortcut REST | `/api/v1/*`       | bearer API token   | iPhone Shortcuts / automations              |

Shortcut REST endpoints:

| Method | Path                        | Body / query                          |
| ------ | --------------------------- | ------------------------------------- | -------------------------------- |
| `GET`  | `/api/v1/alarm/status`      | `?giid=:giid`                         |
| `POST` | `/api/v1/alarm/toggle-full` | `{ "giid": string, "code"?: string }` |
| `POST` | `/api/v1/alarm/mode`        | `{ "giid": string, "mode": "DISARMED" | "ARMED_AWAY", "code"?: string }` |

Dashboard RPC groups:

- `AuthRpcs`: session and logout.
- `CredentialRpcs`: list/create/delete credentials, connection status, MFA request/validate.
- `InstallationRpcs`: list installations and set default installation.
- `AlarmRpcs`: get arm state, arm away/home, disarm, toggle full.
- `DeviceRpcs`: door/window, climate, smart locks, smart plugs.
- `ShortcutRpcs`: export toggle/choose shortcuts, list/revoke API tokens.

RPC middleware declares typed errors rather than returning opaque 500s. Auth failures become `Unauthorized` / `Forbidden`; Verisure failures become safe typed RPC errors; defects remain defects and are handled by server logging with redaction.

## Data model

D1/Drizzle stores Better Auth tables plus application tables:

- `VerisureCredential`: `id`, `userId`, `alias`, encrypted email/password/pin, connection status, default `giid`, timestamps.
- `ApiToken`: `id`, `userId`, `credentialId`, display prefix, token hash, scopes, optional `allowedGiids`, expiry, last-used time, revoked time.
- `ShortcutExport`: `id`, `userId`, `credentialId`, `apiTokenId`, template (`toggle-full` or `choose-mode`), optional download nonce hash, timestamps.

Connection status should be one of `unchecked`, `connected`, `mfa_required`, `auth_failed`, `rate_limited`, or `error`.

Plaintext API tokens are generated during shortcut export or explicit token creation, embedded into the shortcut/import response, and never stored. Revocation affects the API token only; it does not touch the Verisure credential.

## Shortcut templates

Two shortcut exports are required:

- **Toggle Full Alarm**: read `/api/v1/alarm/status`; if `ARMED_AWAY`, call mode `DISARMED`; otherwise call mode `ARMED_AWAY`.
- **Choose Explicit Alarm Mode**: show a Shortcuts menu with “Full off” → `DISARMED` and “Full on” → `ARMED_AWAY`, then call `/api/v1/alarm/mode`.

Shortcut export should return either a generated Apple shortcut file or a signed one-time import URL. Apple shortcut packaging needs validation; if direct file generation is brittle, fall back to a guided dashboard flow with a generated token/API URL and clear recipe.

## Key call graphs

These trees document the flows where dependency order matters. Simpler CRUD/RPC calls can be described by tests and service interfaces.

### Dashboard query through RPC

```text
TanStack Query queryArmState(credentialId, giid)
└── RpcClient(DashboardRpcs).Alarm.GetArmState
    └── POST /api/rpc with Better Auth cookie
        └── DashboardAuthMiddleware provides CurrentUser
            └── CredentialScopeMiddleware provides CurrentCredential
                └── InstallationScopeMiddleware provides CurrentInstallation
                    └── AlarmService.getArmState()
                        └── VerisureGraphQL.execute([ArmState])
                            └── VerisureAuth.ensureSession()
```

### Magic-link login

```text
POST /api/auth/magic-link
└── BetterAuthService.fetch
    ├── Better Auth stores verification token in D1
    └── Better Auth email callback
        └── EmailService.sendMagicLink
            └── Cloudflare.SendEmail.send
```

### Shortcut REST request

```text
POST /api/v1/alarm/mode Authorization: Bearer <token>
└── ApiTokenMiddleware
    ├── hash token with TOKEN_PEPPER when configured
    ├── reject revoked/expired tokens
    └── provide CurrentUser + CurrentCredential
        └── InstallationScopeMiddleware provides CurrentInstallation
            └── AlarmService.armAway/disarm(code?)
                ├── use request code or encrypted credential PIN
                └── VerisureGraphQL.execute([mutation])
```

### Verisure session refresh / login

```text
VerisureAuth.ensureSession()
└── VerisureSessionStore.withCredentialLock
    ├── read CurrentCredential and decrypt email/password
    ├── if valid snapshot exists: return it
    ├── else if refresh cookies exist: GET /auth/token
    ├── else if trust cookie exists: POST /auth/login with trust cookie
    └── else POST /auth/login with basic auth
        ├── if stepUpToken: mfa_required
        └── verify with fetchAllInstallations
```

### Verisure host failover

```text
VerisureTransport.request(method, path)
├── try preferred/automation01 host
├── on network error, 5xx, or SYS_00004: try automation02
├── on 401/403: AuthenticationError
├── on 429 or rate-limit text: RateLimitError
└── on success: remember preferred host and return response
```

## Error taxonomy

Verisure errors should stay structured: `RequestError`, `AuthenticationError`, `LoginError` (`MFARequired`, `CookieReadError`, `CredentialsRejected`), `RateLimitError`, `LogoutError`, `ResponseError`, and `GraphQLError`.

REST error mapping should be safe and predictable: auth/MFA failures map to 401/403, rate limit to 429, user input/login issues to 400, upstream transport/response failures to 502, and unknown defects to 500 with no secret details. RPC uses typed schema errors with the same semantics.

## Session storage

The Durable Object replaces Python's cookie file. Use one object per `verisureCredentialId` to serialize login/refresh/cookie mutation and keep a warm in-memory copy.

```ts
type SessionSnapshot = {
  readonly cookies: ReadonlyArray<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
  }>;
  readonly trustToken?: { trustTokenValue: string; expiresAt?: number };
  readonly preferredBaseUrl?:
    | "https://automation01.verisure.com"
    | "https://automation02.verisure.com";
  readonly authenticatedAt: number;
  readonly expiresAt: number; // conservative: now + 14 minutes after login/refresh
  readonly mfa?: {
    readonly requestedAt: number;
    readonly cookies: SessionSnapshot["cookies"];
  };
};
```

KV may cache non-sensitive installation/status data, but never Verisure credentials, PINs, or session cookies.

## Monorepo package layout

Use a Bun workspace. Apps live under `apps/`; reusable code lives under `packages/`; tests are colocated next to implementation files (`*.test.ts` / `*.test.tsx`).

```text
.
├── alchemy.run.ts
├── package.json
├── apps/
│   ├── api/                         # @verisure/api, Cloudflare Worker
│   │   └── src/
│   │       ├── worker.ts
│   │       ├── SessionObject.ts
│   │       ├── Http/                # App, RestApi, BetterAuthMount, RpcMount, RouteScopes
│   │       ├── Rpc/                 # DashboardHandlers, DashboardAuthLive
│   │       ├── Layers.ts
│   │       └── *.test.ts
│   └── web/                         # @verisure/web, TanStack Start
│       └── src/
│           ├── routes/
│           ├── rpc/                 # client.ts, query.ts, mutations.ts
│           ├── components/
│           ├── shortcut-export/
│           └── *.test.tsx
└── packages/
    ├── domain/                      # pure DTOs, errors, GraphQL operation builders
    ├── rpc-contract/                # Effect Schema DTOs, typed errors, DashboardRpcs
    ├── db/                          # Drizzle schema, repositories, D1Live, effect-d1 adapter
    └── server/                      # BetterAuth, Email, credentials, tokens, shortcuts, Verisure services
```

Dependency direction:

```text
apps/web ──────────┐
                   ├── packages/rpc-contract ─── packages/domain
apps/api ──────────┘             ▲
        │                        │
        ├── packages/server ─────┘
        └── packages/db ─────────┘
```

Forbidden dependencies: `rpc-contract` must not import server/db/Cloudflare/Better Auth/TanStack; `domain` must not import RPC/HTTP/Cloudflare/Better Auth/storage; `apps/web` must not import server internals; REST handlers should call server services, not RPC handlers directly.

Implementation reuse note: `/Users/utopy/Documents/Void/Dev/spells` already has Better Auth + D1/Drizzle building blocks (`packages/auth`, `packages/db`, and `apps/web/backend.ts`). Copy/adapt those into `packages/server` and `packages/db`, but keep the new boundaries (`EmailService`, `BetterAuthService`, context tags) explicit.

## Testing strategy

Colocate tests. Pure package tests should cover GraphQL operation builders, cookie parsing/serialization, token hashing, shortcut rendering, and error mapping. Service tests should stub layers for D1, email, fetch, and Durable Object sessions. RPC tests should use `RpcTest.makeClient(DashboardRpcs)` with stub services. REST tests should verify bearer-token auth, revoked/expired token rejection, and route validation. Workerd/Alchemy smoke tests should prove `alchemy dev` starts the Vite app and API Worker, Config secrets bind, D1 persists data, SendEmail can be stubbed locally, and the Durable Object stores per-credential sessions.

## Key design decisions

1. **D1/Drizzle for application data**: Better Auth and application tables share D1; R2 is unnecessary for the database.
2. **Effect Config for secrets**: Alchemy binds `Config.redacted` values as Worker secrets; no Secrets Store unless runtime secret retrieval is needed.
3. **Dedicated EmailService**: Better Auth depends on email delivery, but email sending remains a separate infrastructure layer.
4. **Context tags for scoped requests**: middleware provides `CurrentUser`, `CurrentCredential`, and `CurrentInstallation`, avoiding repeated IDs across service APIs.
5. **RPC for dashboard, REST for shortcuts**: typed Effect RPC powers the TanStack dashboard; stable bearer-token REST powers iPhone Shortcuts.
6. **Durable Object for Verisure sessions**: replaces Python's cookie file and prevents concurrent refresh races.
7. **Pure Verisure operation builders**: easy to regression-test against `repos/verisure-python` payloads.
8. **Transport owns failover and upstream error taxonomy**: domain services should not know about automation host selection.
9. **Alchemy owns Cloudflare wiring**: `alchemy dev/deploy` is the source of truth, including custom route support from the local branch.
10. **No secret leakage**: use `Redacted`, encrypted credential storage, hashed API tokens, and centralized REST/RPC error mapping.
