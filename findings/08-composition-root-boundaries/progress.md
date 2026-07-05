# Progress — 08 Composition root boundaries

## what to do

- Split Worker-level layer composition from route dispatch.
- Create named infrastructure, persistence, application, and HTTP app layers.
- Make `worker.ts` a thin Cloudflare/alchemy adapter.

## what is done

- Identified `apps/api/src/worker.ts` as the overloaded composition root.
- Compared with Effect HTTP server and layer composition examples.
- Documented a target module split.

## what is next

- Address after `05-layer-composition-naming`, since lower-level layer naming should be settled first.
- Coordinate with `04-http-api-schema-first`, because a schema-first route graph gives a cleaner `HttpAppLayer`.
- Dependencies: `05-layer-composition-naming`; benefits from `04-http-api-schema-first`.
