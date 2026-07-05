# 05 — Layer composition and naming hide dependency boundaries

## What's wrong

Effect examples distinguish between dependency-free implementation layers and fully-provided public layers. Our code often uses names like `Live`, `Default`, and `layer` inconsistently, sometimes providing transitive dependencies inside a service layer and sometimes at the application root.

References from `repos/effect`:

- `repos/effect/ai-docs/src/01_effect/02_services/20_layer-composition.ts` — demonstrates `layerNoDeps`, `layer`, and `layerWithSqlClient` with explicit dependency exposure.
- `repos/effect/ai-docs/src/01_effect/02_services/20_layer-unwrap.ts` — uses `Layer.unwrap` for dynamic/config-derived layers.
- `repos/effect/ai-docs/src/51_http-server/10_basics.ts` — API route layer is composed at the server boundary with `Layer.provide([...])`.

## Concrete examples in our code

### Mixed public/private dependency semantics

`packages/server/src/Verisure/VerisureTransport.ts`:

```ts
static readonly layer = (options = {}) =>
  Layer.effect(VerisureTransport, Effect.gen(function* () { ... }))
    .pipe(Layer.provide(FetchHttpClient.layer));

static readonly Live = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* RuntimeConfig;
    return VerisureTransport.layer({ ... });
  })
);
```

Here `layer` both constructs the service and privately provides `FetchHttpClient.layer`. That makes it harder to test with another `HttpClient` unless callers know which layer to avoid or override. The Effect composition fixture would name variants according to what they require/expose.

### `Live` sometimes includes transitive dependencies

`packages/server/src/Email/CloudflareEmailLive.ts`:

```ts
export const CloudflareEmailLive = Layer.effect(...)
  .pipe(Layer.provide(Cloudflare.SendEmailBindingLive));
```

`packages/server/src/Auth/BetterAuthService.ts`:

```ts
static readonly Live = Layer.effect(...).pipe(Layer.provide(EmailLive));
```

`packages/server/src/Services/index.ts` then also composes broader application dependencies:

```ts
export const ApplicationServicesLive = Layer.merge(...).pipe(
  Layer.provideMerge(VerisureRequests.Live),
  Layer.provideMerge(CredentialCrypto.Live.pipe(Layer.orDie))
);
```

This works, but readers cannot tell from the name whether `Live` is “requires all dependencies”, “already provides some dependencies”, or “fully ready”.

### More idiomatic reference shape

From `repos/effect/ai-docs/src/01_effect/02_services/20_layer-composition.ts`:

```ts
static readonly layerNoDeps = Layer.effect(UserRepository, ...)

static readonly layer = this.layerNoDeps.pipe(
  Layer.provide(SqlClientLayer)
)

static readonly layerWithSqlClient = this.layerNoDeps.pipe(
  Layer.provideMerge(SqlClientLayer)
)
```

The name communicates dependency requirements and what remains exposed.

## Why it matters

- Hidden `Layer.provide` calls make test substitution and production wiring harder to reason about.
- Inconsistent names increase cognitive load across repositories/services/transports.
- Layer dependency boundaries are architecture documentation in Effect applications; they should be visible.

## Preferred shape

Adopt a small naming convention:

- `layerNoDeps` or `layerFromX` — implementation layer that still requires dependencies.
- `layer` or `Live` — public fully/properly provided layer, but document what it still requires.
- `Test`, `InMemory`, `Mock` — explicit test implementations.
- `Configured` / `fromConfig` — dynamic `Layer.unwrap` variants.

For example:

```ts
static readonly layerNoDeps = (options: VerisureTransportOptions = {}) =>
  Layer.effect(VerisureTransport, ...)

static readonly layer = (options = {}) =>
  VerisureTransport.layerNoDeps(options).pipe(Layer.provide(FetchHttpClient.layer))

static readonly Live = Layer.unwrap(...)
```

Then application root layers can intentionally decide whether to provide or merge dependencies.
