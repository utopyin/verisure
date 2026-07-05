# 09 — HTTP/RPC file structure is split by technical adapter, not by feature/API boundary

## What's wrong

The API app separates files by transport concern (`Http`, `Rpc`, middleware, mounts), while the Effect HTTP fixtures separate shared API definitions from server implementations and keep feature handlers close to their API group. Our current structure makes cross-cutting flow for one feature hard to trace.

References from `repos/effect`:

- `repos/effect/ai-docs/src/51_http-server/10_basics.ts` — API definitions are separate from server implementation and shareable with clients.
- `repos/effect/ai-docs/src/51_http-server/fixtures/api/Users.ts` — feature-level API group definition.
- `repos/effect/ai-docs/src/51_http-server/fixtures/server/Users/http.ts` — matching feature-level handler implementation.
- `repos/effect/ai-docs/src/51_http-server/fixtures/api/Authorization.ts` and `fixtures/server/Authorization.ts` — middleware contract and implementation are separated.

## Concrete examples in our code

Current API files:

```txt
apps/api/src/Http/App.ts
apps/api/src/Http/RestApi.ts
apps/api/src/Http/RpcMount.ts
apps/api/src/Http/ErrorMapper.ts
apps/api/src/Rpc/AlarmHandlers.ts
apps/api/src/Rpc/AuthHandlers.ts
apps/api/src/Rpc/CredentialHandlers.ts
apps/api/src/Rpc/DeviceHandlers.ts
apps/api/src/Rpc/InstallationHandlers.ts
apps/api/src/Rpc/ShortcutHandlers.ts
apps/api/src/Rpc/AuthMiddleware.ts
apps/api/src/Rpc/ScopeMiddleware.ts
```

Contracts are elsewhere:

```txt
packages/rpc-contract/src/rpcs.ts
packages/rpc-contract/src/errors.ts
```

This is reasonable for RPC sharing, but feature flow is scattered. For example, alarm behavior spans:

- `packages/rpc-contract/src/rpcs.ts` — alarm schema
- `apps/api/src/Rpc/AlarmHandlers.ts` — dashboard RPC handlers
- `apps/api/src/Http/RestApi.ts` — shortcut REST alarm endpoints
- `packages/server/src/Services/AlarmService.ts` — application service
- `packages/server/src/Verisure/VerisureRequests.ts` — upstream operations
- `apps/api/src/Http/ErrorMapper.ts` — HTTP/RPC error projection

In the Effect fixtures, the API group and handler group have a 1:1 structure (`api/Users.ts` ↔ `server/Users/http.ts`).

## Why it matters

- A developer changing one feature must jump across transport-based folders and central mappers.
- REST and RPC alarm endpoints are implemented in different styles, even though they call the same application service.
- Middleware contract and implementation are coupled inside `apps/api/src/Rpc/*`, while Effect HTTP examples put middleware service definitions in the shared API layer and implementations in server code.
- High-level API boundaries are not obvious from the file tree.

## Preferred shape

Consider a feature/API-group oriented structure:

```txt
packages/api-contract/src/alarm.ts
packages/api-contract/src/credential.ts
packages/api-contract/src/auth.ts
packages/api-contract/src/errors.ts

apps/api/src/features/alarm/rpc.ts
apps/api/src/features/alarm/rest.ts
apps/api/src/features/alarm/errors.ts        # only if feature-specific projection is needed
apps/api/src/features/auth/middleware.ts
apps/api/src/Http/AppLayer.ts
```

Or, if keeping current package names:

```txt
packages/rpc-contract/src/alarm.ts
packages/rpc-contract/src/credential.ts
packages/rpc-contract/src/errors.ts
apps/api/src/Rpc/alarm/handlers.ts
apps/api/src/Rpc/alarm/index.ts
```

The key is not the exact folders; it is preserving a visible 1:1 relationship between API definitions, middleware contracts, and handlers.

## Relationship to existing findings

- `04-http-api-schema-first` addresses REST schema style.
- This finding addresses where those schema and handler files should live so HTTP/RPC services remain navigable.
