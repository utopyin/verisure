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
- Added `apps/api/src/Http/ShortcutApi.ts` as the schema-first Shortcut REST contract for the alarm status/toggle/mode endpoints.
- Added `apps/api/src/Http/ShortcutHandlers.ts` with `HttpApiBuilder.group` handlers that keep shortcut bearer parsing and request-scoped server context provisioning.
- Rewired `apps/api/src/Http/RestApi.ts` to keep `ShortcutRestMount` and `ShortcutRestHttp` while serving the `ShortcutApi` through `HttpApiBuilder.layer` and preserving the REST 404/validation envelopes.

## what is next

- Scalar docs remain optional and are not wired yet.
- Further handler/file organization can happen with finding 09 follow-up work if useful.
