# Progress — 09 Feature-slice file structure

## what to do

- Decide whether API code should be organized by feature/API group instead of by transport folders.
- Split large shared contract files (`rpcs.ts`) into feature modules if the project continues growing.
- Keep middleware contracts and implementations separated, mirroring Effect fixtures.

## what is done

- Identified scattered feature paths for alarm/credential flows.
- Compared with Effect `api/Users.ts` and `server/Users/http.ts` fixture structure.
- Documented possible target structures.

## what is next

- Do this together with `04-http-api-schema-first` so new REST contracts land in the chosen structure.
- If minimizing churn, start by splitting `packages/rpc-contract/src/rpcs.ts` into feature files.
- Dependencies: benefits from `04-http-api-schema-first`; independent from error-schema migration.
