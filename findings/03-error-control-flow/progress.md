# Progress — 03 Error control flow

## what to do

- Replace success-channel `Result` branching with typed error-channel composition where practical.
- Remove mutable `lastError` failover loops in favor of Effect combinators or small named helpers.
- Separate retryable vs non-retryable errors using tags/reasons.

## what is done

- Identified concrete cases in `VerisureTransport.request`, `VerisureAuth.recoverExpiredSnapshot`, and `VerisureAuth.requestMfa`.
- Compared with Effect error-handling and HTTP fixtures.
- Introduced named failover helpers in `packages/server/src/Verisure/VerisureTransport.ts`:
  - `VerisureTransport.executeAgainstBaseUrl`
  - `VerisureTransport.tryBaseUrls`
- Replaced the mutable `lastError` / success-channel attempt object in `VerisureTransport.request` with typed failures and selective failover for retryable `RequestError` or `ResponseError` with `statusCode >= 500`.
- Refactored `VerisureAuth.recoverExpiredSnapshot` from `Effect.result` + `Result.isSuccess` branching to `Effect.catchAll` fallback composition.
- Refactored `VerisureAuth.withStatusUpdates` from `Effect.result` branching to `Effect.tapError`.
- Refactored `VerisureAuth.requestMfa` from a mutable `lastError` loop to `Effect.firstSuccessOf` over typed MFA request effects.
- Removed the `effect/Result` import from `VerisureAuth.ts`.
- Ran `bun fix`.
- Ran `bun check`; it still fails on pre-existing alchemy module/type issues outside this refactor.
- Follow-up during finding 07 replaced `Effect.catchAll` with the Effect 4-compatible `Effect.matchEffect` fallback form in `VerisureTransport` and `VerisureAuth` after targeted server tests exposed `Effect.catchAll is not a function` at runtime.

## what is next

- Continue to use `catchTag` / `catchTags` where predicates can become pure tag matches after the HTTP/RPC error contract pass.
- Review test-only `Effect.result` usage under finding 07 rather than this production-control-flow finding.
- Dependencies satisfied: `01-effect-fn-boundaries` and `02-schema-tagged-errors`.
