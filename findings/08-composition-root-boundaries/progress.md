# Progress — 08 Composition root boundaries

## what to do

- Split Worker-level layer composition from route dispatch.
- Create named infrastructure, persistence, application, and HTTP app layers.
- Make `worker.ts` a thin Cloudflare/alchemy adapter.

## what is done

- Identified `apps/api/src/worker.ts` as the overloaded composition root.
- Compared with Effect HTTP server and layer composition examples.
- Documented a target module split.
- Added named API composition modules:
  - `apps/api/src/layers/Infrastructure.ts` for Cloudflare/alchemy bindings, runtime config, session object, and browser crypto.
  - `apps/api/src/layers/Persistence.ts` for repositories and Verisure session store over `DatabaseLive`.
  - `apps/api/src/layers/Application.ts` for `ApplicationServicesLayer`, `ApplicationLayer`, and `ApiWorkerLayer`, using `Layer.provideMerge` so the HTTP app is explicitly provided by application services, persistence, and infrastructure.
  - `apps/api/src/layers/index.ts` as the layer barrel.
- Added `apps/api/src/Http/Routes.ts` with an `ApiHttpApp` service and `ApiHttpAppLive` route-dispatch layer.
- Reduced `apps/api/src/worker.ts` to the Cloudflare Worker declaration plus resolving `ApiHttpApp` from `ApiWorkerLayer`.
- Ran `bun fix`.
- Ran `bun check`; it still fails on pre-existing alchemy module/type issues outside this refactor.

## what is next

- Coordinate with `04-http-api-schema-first`, because `ApiHttpAppLive` can become the composition point for schema-first route groups.
- Coordinate with `10-http-rpc-error-boundaries` so route-level error policies move closer to route/contract definitions.
- Dependencies: `05-layer-composition-naming` is satisfied.
