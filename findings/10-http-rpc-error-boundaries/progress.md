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
- Completed the REST half for Shortcut REST: added REST-native error schemas/helpers in `apps/api/src/Http/ShortcutErrors.ts`, stopped the Shortcut REST path from importing or mapping through `DashboardRpcError`, and mapped repository/session/platform failures to a REST `503 service_unavailable` envelope.
- Completed the RPC mapper relocation: moved dashboard RPC error mapping to `apps/api/src/Rpc/ErrorMapper.ts`, updated RPC handlers/middleware to import the RPC-local mapper, and removed the obsolete HTTP-owned mapper.

## what is next

- Keep the current RPC public error union unchanged until an explicit client-contract change is approved.
- RPC mapper cleanup still benefits from future group-level helper/middleware work to reduce repeated per-handler `Effect.mapError(toDashboardRpcError)`.
