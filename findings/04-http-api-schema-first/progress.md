# Progress — 04 HTTP API schema-first

## what to do

- Extract shortcut REST endpoint definitions into a schema-first API module.
- Define request, response, and error schemas at the API contract level.
- Reimplement handlers with `HttpApiBuilder.group`.
- Serve the API through `HttpApiBuilder.layer` and optionally expose OpenAPI/Scalar docs.

## what is done

- Identified `apps/api/src/Http/RestApi.ts` as the main manual-router surface.
- Compared with `repos/effect/ai-docs/src/51_http-server/10_basics.ts` and fixtures.
- Documented concrete mismatch and target shape.

## what is next

- Migrate errors to schema-backed classes first or concurrently (`02-schema-tagged-errors`).
- Decide whether REST contract belongs in `packages/rpc-contract` or a new `packages/http-contract`.
- Dependencies: `02-schema-tagged-errors`; benefits from `01-effect-fn-boundaries` for handler names.
