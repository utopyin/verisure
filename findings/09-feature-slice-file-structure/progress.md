# Progress — 09 Feature-slice file structure

## what to do

- Decide whether API code should be organized by feature/API group instead of by transport folders.
- Split large shared contract files (`rpcs.ts`) into feature modules if the project continues growing.
- Keep middleware contracts and implementations separated, mirroring Effect fixtures.

## what is done

- Identified scattered feature paths for alarm/credential flows.
- Compared with Effect `api/Users.ts` and `server/Users/http.ts` fixture structure.
- Documented possible target structures.
- Split `packages/contract/src/rpcs.ts` into feature modules as top-level modules under `packages/contract/src/` for auth, credential, installation, alarm, device, and shortcut RPC groups.
- Kept `packages/contract/src/shared.ts` for schema constants shared across feature groups.
- Kept `packages/contract/src/rpcs.ts` as the compatibility composer/barrel that re-exports the existing public group names and merges `DashboardRpcs` in the existing order.

## what is next

- Defer app handler folder moves until a later feature/API restructuring slice needs them.
- Do not combine this contract split with Shortcut REST `HttpApi` work or RPC error-boundary changes.
