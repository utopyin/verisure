# 08 — Application composition root mixes infrastructure, persistence, services, and route dispatch

## What's wrong

The top-level Worker file is doing several architectural jobs at once: declaring infrastructure bindings, composing persistence, composing application services, selecting HTTP/RPC mounts, and implementing request dispatch. Effect examples tend to make each composition layer explicit and keep the server entrypoint as a thin launch/handler boundary.

References from `repos/effect`:

- `repos/effect/ai-docs/src/01_effect/02_services/20_layer-composition.ts` — distinguishes implementation layers from fully-provided layers.
- `repos/effect/ai-docs/src/51_http-server/10_basics.ts` — defines `ApiRoutes`, `DocsRoute`, `AllRoutes`, and `HttpServerLayer` as separate composition steps.
- `repos/effect/ai-docs/src/01_effect/05_running/20_layer-launch.ts` — runtime entrypoints are thin around a composed layer.

## Concrete examples in our code

`apps/api/src/worker.ts` currently contains:

```ts
const InfraLayer = Layer.mergeAll(
  Cloudflare.KVNamespaceBindingLive,
  Cloudflare.RateLimitBindingLive,
  Cloudflare.D1ConnectionLive,
  VerisureSessionObjectLive,
  Server.RuntimeConfig.Live,
  BrowserCryptoLayer
);

const PersistenceLayer = Layer.mergeAll(
  Server.RepositoryLive,
  VerisureSessionStoreLive
).pipe(Layer.provideMerge(DatabaseLive));

export const ApiWorkerLayer = Layer.mergeAll(
  Server.ApplicationServicesLive,
  Server.BetterAuthService.Live
).pipe(Layer.provideMerge(PersistenceLayer), Layer.provideMerge(InfraLayer));
```

The same file then performs path dispatch:

```ts
if (pathname.startsWith("/api/auth")) return yield* auth.fetch...
if (pathname.startsWith("/api/rpc")) return yield* dashboardRpcHttp;
if (pathname.startsWith("/api/v1/")) return yield* shortcutRestHttp;
```

In Effect's HTTP example, the route graph is a named layer:

```ts
const ApiRoutes = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide([UsersApiHandlers, SystemApiHandlers]));

const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute);
```

## Why it matters

- The Worker module is harder to reason about because it owns both dependency selection and request routing.
- The dependency graph is not named in domain terms. `InfraLayer`, `PersistenceLayer`, and `ApiWorkerLayer` are useful, but there is no separate “HTTP app layer” / “routes layer” / “server adapter layer”.
- Layer wiring is spread across `worker.ts`, `packages/server/src/Services/index.ts`, `packages/server/src/Repositories/index.ts`, and individual service files.
- It is difficult to test the route graph without also understanding Worker/infrastructure composition.

## Preferred shape

Introduce explicit composition modules, for example:

- `apps/api/src/layers/Infrastructure.ts`
- `apps/api/src/layers/Persistence.ts`
- `apps/api/src/layers/Application.ts`
- `apps/api/src/Http/Routes.ts` or `apps/api/src/Http/AppLayer.ts`
- `apps/api/src/worker.ts` as the thin Cloudflare/alchemy adapter

Target shape:

```ts
export const HttpAppLayer = Layer.mergeAll(
  AuthRoutes,
  DashboardRpcRoutes,
  ShortcutApiRoutes,
  HealthRoutes
);

export const ApiApplicationLayer = HttpAppLayer.pipe(
  Layer.provideMerge(ApplicationServicesLayer),
  Layer.provideMerge(PersistenceLayer),
  Layer.provideMerge(InfrastructureLayer)
);
```

Then `worker.ts` only exports the Cloudflare Worker using the composed app.

## Relationship to existing findings

This is a higher-level version of `05-layer-composition-naming`: not only should individual layers be named consistently, the application composition root should be decomposed into named architectural layers.
