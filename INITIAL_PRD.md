# Initial PRD: Verisure Dashboard, RPC API, and Shortcut Automation

## Problem Statement

The user wants a Cloudflare-native Verisure control surface that is safe, typed, and automation-friendly. Today the repository is only a minimal Bun entrypoint, while the desired product needs to authenticate a dashboard user, store that user's Verisure credentials securely, manage Verisure sessions reliably in workerd, expose alarm/device status through a typed frontend API, and generate iPhone Shortcuts that can call stable REST endpoints using scoped API tokens.

The user also needs the implementation to stay Effect-first: infrastructure, auth, email, persistence, Verisure transport, sessions, domain services, RPC handlers, and REST routes should be explicit Effect services/layers rather than ad-hoc runtime code. The architecture should be deployable with Alchemy, use Bun as the package manager, run on Cloudflare Workers/workerd, and support the custom domain surface `verisure.utopy.sh/api/*` with RPC under `/api/rpc/*`.

## Solution

Build a monorepo-based Verisure application with two apps and several shared packages.

The web app is a TanStack Start dashboard. It authenticates users via Better Auth magic links, backed by D1/Drizzle and Cloudflare email sending. Once authenticated, users can add encrypted Verisure credentials, see connection status, complete MFA when needed, inspect installations and device state, control basic alarm state, and export iPhone Shortcuts.

The backend API app is a single Cloudflare Worker. It mounts Better Auth under `/api/auth/*`, typed Effect RPC under `/api/rpc/*`, stable iPhone Shortcut REST routes under `/api/v1/*`, and a health route under `/api/health`. Dashboard calls use Effect RPC and TanStack Query wrappers. Shortcut calls use bearer API tokens associated with a specific Verisure credential.

Application data is stored in Cloudflare D1 through Drizzle. Verisure session cookies are stored per credential in a Durable Object to serialize login/refresh operations and replace Python's cookie-file behavior. Secrets and deployment-time config use Effect Config values bound by Alchemy as Worker secrets. User Verisure credentials and optional PINs are encrypted at rest and decrypted only in credential-scoped services. API tokens are shown once, stored only as hashes, and optionally peppered.

## User Stories

1. As a dashboard user, I want to sign in with an email magic link, so that I do not need to manage a password for this app.
2. As a dashboard user, I want magic-link email delivery to work through the configured Cloudflare email service, so that sign-in works in production.
3. As a dashboard user, I want my authenticated session to persist in the browser, so that I do not need to sign in on every dashboard visit.
4. As a dashboard user, I want to sign out, so that I can end my dashboard session.
5. As a dashboard user, I want to add my Verisure email and password, so that the app can connect to my Verisure account.
6. As a dashboard user, I want to optionally add my Verisure PIN, so that shortcut automations can run without prompting me for a code.
7. As a dashboard user, I want my Verisure credentials and PIN encrypted at rest, so that stored credentials are not plaintext in application storage.
8. As a dashboard user, I want to see whether a Verisure credential is connected, requires MFA, is rate limited, or has failed authentication, so that I know whether automations can run.
9. As a dashboard user, I want to request Verisure MFA from the dashboard, so that I can complete login when Verisure requires step-up authentication.
10. As a dashboard user, I want to validate a Verisure MFA code from the dashboard, so that the app can store trusted session cookies for future requests.
11. As a dashboard user, I want to remove a Verisure credential, so that I can revoke the app's ability to use that account.
12. As a dashboard user, I want to list my Verisure installations, so that I can choose which alarm system to inspect or control.
13. As a dashboard user, I want to set a default installation, so that shortcut exports can target the right alarm by default.
14. As a dashboard user, I want to see the current alarm state, so that I know whether the alarm is armed or disarmed.
15. As a dashboard user, I want to arm away, so that I can fully arm the alarm from the dashboard.
16. As a dashboard user, I want to arm home, so that I can partially arm the alarm from the dashboard when supported.
17. As a dashboard user, I want to disarm, so that I can turn the alarm off from the dashboard.
18. As a dashboard user, I want to toggle between fully armed and disarmed, so that I can quickly switch the alarm state.
19. As a dashboard user, I want to see door/window sensor status, so that I can verify whether doors or windows are open.
20. As a dashboard user, I want to see climate sensor status, so that I can inspect temperature and humidity devices.
21. As a dashboard user, I want to see smart lock status, so that I can inspect lock state from the dashboard.
22. As a dashboard user, I want to see smart plug status, so that I can inspect connected smart plugs.
23. As a dashboard user, I want dashboard data fetching to use typed RPC, so that frontend calls are type-safe and easy to wrap with TanStack Query.
24. As a dashboard user, I want dashboard queries to cache and invalidate correctly, so that the UI stays responsive and accurate after mutations.
25. As a dashboard user, I want to export a Toggle Full Alarm iPhone Shortcut, so that I can switch between full on and full off from my phone.
26. As a dashboard user, I want to export a Choose Alarm Mode iPhone Shortcut, so that I can explicitly choose full on or full off from my phone.
27. As a dashboard user, I want shortcut export to generate an API token on demand, so that each shortcut has scoped credentials without manually creating tokens.
28. As a dashboard user, I want API tokens associated with a Verisure credential, so that a shortcut can only operate the credential it was exported for.
29. As a dashboard user, I want to see API token summaries without seeing plaintext tokens again, so that I can audit active automation access.
30. As a dashboard user, I want to revoke an API token, so that I can disable a shortcut without deleting my Verisure credentials.
31. As an iPhone Shortcuts user, I want a simple REST endpoint to read alarm status, so that Shortcuts can branch based on current state.
32. As an iPhone Shortcuts user, I want a simple REST endpoint to set alarm mode, so that Shortcuts can explicitly arm or disarm.
33. As an iPhone Shortcuts user, I want a simple REST endpoint to toggle full alarm mode, so that Shortcuts can implement one-tap automation.
34. As an iPhone Shortcuts user, I want REST calls to authenticate with bearer tokens, so that no browser session is required.
35. As an iPhone Shortcuts user, I want tokens to be scoped and revocable, so that leaked or outdated shortcuts can be disabled.
36. As the system owner, I want Verisure sessions stored per credential in a Durable Object, so that concurrent requests do not race during login or refresh.
37. As the system owner, I want Verisure upstream host failover, so that the app retries `automation02` when `automation01` fails or returns `SYS_00004`.
38. As the system owner, I want upstream errors classified structurally, so that dashboard RPC and REST endpoints return safe, predictable errors.
39. As the system owner, I want Alchemy to own Cloudflare resources and dev/deploy flows, so that there is no separate Wrangler-first configuration path.
40. As the system owner, I want custom domain routing under `verisure.utopy.sh/api/*`, so that the API has a stable production surface.
41. As a developer, I want pure Verisure GraphQL operation builders, so that they can be regression-tested against the Python implementation.
42. As a developer, I want infrastructure behind Effect services, so that Cloudflare bindings do not leak into domain logic.
43. As a developer, I want request-scoped context tags for user, credential, and installation, so that service APIs stay clean.
44. As a developer, I want shared RPC contracts, so that frontend and backend agree on payloads, responses, and errors.
45. As a developer, I want colocated tests, so that each package/app documents its behavior next to its implementation.

## Implementation Decisions

- Use Bun workspaces with two apps: a TanStack Start web app and a Cloudflare Worker API app.
- Use shared packages for domain types/operation builders, RPC contracts, D1/Drizzle persistence, and server service implementations.
- The backend API is a single Worker. It mounts Better Auth, Effect RPC, Shortcut REST, and health routes in one entrypoint.
- The public backend route target is `verisure.utopy.sh/api/*`; Effect RPC is mounted under `/api/rpc/*`.
- Use Alchemy for Cloudflare resource creation, local dev, deploys, logs, and custom routes.
- Use the local Alchemy custom-domain routes branch as a prerequisite for the custom route behavior.
- Use Effect Config for deployment-time secrets and config. `BETTER_AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, and `TOKEN_PEPPER` are Config-backed Worker secrets.
- Use D1/Drizzle for Better Auth tables and application tables. Do not use R2 as the application database.
- Keep email delivery as an `EmailService` infrastructure service. The Cloudflare implementation binds SendEmail, while Better Auth depends only on the service contract.
- Configure Better Auth in an Effect that can yield `EmailService`, D1-backed storage, and runtime config.
- Reuse and adapt the existing Better Auth and D1/Drizzle implementation patterns from the sibling `spells` project.
- Use context tags for scoped requests: `CurrentUser`, `CurrentCredential`, and `CurrentInstallation`.
- Dashboard RPC middleware provides `CurrentUser` from the Better Auth session cookie.
- Credential-scoped RPC/HTTP middleware verifies ownership and provides `CurrentCredential`.
- Installation-scoped RPC/HTTP middleware validates the selected `giid` and provides `CurrentInstallation`.
- Shortcut REST middleware authenticates bearer API tokens, rejects revoked or expired tokens, and provides the relevant request context tags.
- Store user Verisure credentials encrypted at rest. Decrypt credentials only inside credential-scoped Verisure services.
- Store optional PINs encrypted at rest. If a mutation request omits a code, alarm services may use the encrypted PIN when present.
- Store API tokens only as hashes with display prefixes. Plaintext tokens are shown only once and embedded into shortcut export output.
- Use `TOKEN_PEPPER` for API token hash hardening when configured. The name is general because tokens may serve future non-shortcut use cases.
- Use a Durable Object per Verisure credential to store and serialize Verisure session snapshots.
- Verisure transport owns upstream host failover, rate-limit detection, HTTP status mapping, and `SYS_00004` behavior.
- Verisure GraphQL operation builders are pure and shared from the domain package.
- Dashboard data access uses Effect RPC. The web app builds a typed RPC client and exposes TanStack Query wrappers.
- iPhone Shortcuts use stable REST endpoints, not RPC, because Shortcuts needs a simple HTTP/JSON interface.
- Shortcut export supports two templates: Toggle Full Alarm and Choose Explicit Alarm Mode.
- Direct Apple shortcut file generation is desired but must be validated. A guided fallback with token/API URL is acceptable if Apple packaging proves brittle.

## Testing Decisions

- Tests should verify externally observable behavior at the highest practical seam. Avoid asserting implementation details inside layers when route/RPC/service behavior can be tested instead.
- Pure domain tests cover Verisure GraphQL operation payloads, cookie parsing/serialization, alarm-mode mapping, and error classification.
- DB/repository tests cover D1/Drizzle persistence for users, credentials, API tokens, and shortcut export audits.
- Server service tests use stub layers for D1, email, fetch, and Durable Object session storage.
- Verisure transport tests simulate network errors, 5xx responses, 401/403, 429, rate-limit text, and `SYS_00004` host failover.
- Verisure auth tests cover login, cookie refresh, trust-cookie login, MFA request, MFA validation, and credential status updates.
- RPC tests use `RpcTest.makeClient` against the dashboard RPC contract with stubbed server services.
- RPC middleware tests verify unauthenticated dashboard calls fail with typed unauthorized errors and credential-scoped calls reject credentials not owned by the current user.
- Web tests verify TanStack Query wrappers produce stable keys and invalidate the correct queries after mutations.
- REST tests verify Shortcut bearer tokens, token revocation, token expiry, missing scopes, request validation, and stable JSON responses.
- Workerd/Alchemy smoke tests verify local dev starts both web and API, Config secrets bind, D1 persists data, SendEmail can be stubbed locally, and the Durable Object stores per-credential session snapshots.
- Tests are colocated next to implementation files rather than collected in a root test directory.

## Out of Scope

- Supporting every Verisure Python command in the first implementation.
- Camera image capture/download support.
- Door lock mutations, smart plug mutations, and advanced device configuration.
- Multi-user sharing of the same Verisure credential.
- A full token management product beyond list/revoke and shortcut export generation.
- Native mobile apps other than iPhone Shortcuts integration.
- Replacing Better Auth with a custom auth system.
- Using R2 for the application database.
- Storing Verisure credentials as Cloudflare deploy-time secrets.
- Publishing the PRD to an external issue tracker in this initial file-only step.

## Further Notes

The architecture document has already been created and should remain the technical design reference. This PRD captures the product and implementation scope for turning that design into implementation work.

A side quest is already tracked in todos for rebasing the local Alchemy custom-domain routes branch and linking the local Alchemy package into this repo.

The exact Apple Shortcuts export format should be validated early. If direct file generation requires signing or unsupported packaging, the implementation should still deliver value through a guided shortcut creation flow with a generated bearer token and REST URL.
