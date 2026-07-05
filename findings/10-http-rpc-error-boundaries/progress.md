# Progress — 10 HTTP/RPC error boundaries

## what to do

- Separate internal application errors from public RPC/REST contract errors.
- Avoid using one central mapper as the only place where API semantics are defined.
- Move HTTP status semantics into schema-backed HTTP API errors.
- Reduce repeated per-handler `Effect.mapError(toDashboardRpcError)`.

## what is done

- Reviewed `apps/api/src/Http/ErrorMapper.ts`, RPC handlers, RPC contract errors, and middleware.
- Compared with Effect HTTP API and middleware fixtures.
- Documented concerns around conflating storage/platform failures with Verisure upstream failures.

## what is next

- Start with `02-schema-tagged-errors` so app errors are tag/reason matchable.
- Then split public error contracts for Dashboard RPC vs Shortcut REST.
- Finally simplify handler error mapping through group-level helpers/middleware.
- Dependencies: `02-schema-tagged-errors`; strongly benefits from `04-http-api-schema-first`.
