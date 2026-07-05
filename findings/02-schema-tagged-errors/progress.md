# Progress — 02 Schema-tagged errors

## what to do

- Classify errors into boundary-crossing errors vs local/internal implementation errors.
- Convert boundary errors to `Schema.TaggedErrorClass`.
- Add explicit schemas/status annotations where errors are intended for HTTP/RPC responses.
- Update error handling to use `_tag`, `Effect.catchTag`, `Effect.catchTags`, or reason handling instead of relying on `instanceof` everywhere.

## what is done

- Identified all major `Data.TaggedError` locations.
- Compared with Effect app docs and HTTP fixtures.
- Documented why `Data.TaggedError` is not universally wrong, but is less idiomatic for this app's domain/API errors.

## what is next

- Start with `packages/domain/src/errors.ts`, because many other packages depend on it.
- Then migrate server errors that flow to `apps/api/src/Http/ErrorMapper.ts`.
- Dependencies: preferably after or alongside `04-http-api-schema-first`, because the final error schemas should match HTTP/RPC contracts.
