# Progress — 03 Error control flow

## what to do

- Replace success-channel `Result` branching with typed error-channel composition where practical.
- Remove mutable `lastError` failover loops in favor of Effect combinators or small named helpers.
- Separate retryable vs non-retryable errors using tags/reasons.

## what is done

- Identified concrete cases in `VerisureTransport.request`, `VerisureAuth.recoverExpiredSnapshot`, and `VerisureAuth.requestMfa`.
- Compared with Effect error-handling and HTTP fixtures.

## what is next

- First introduce named helpers (`01-effect-fn-boundaries`).
- Then add schema/reason error shapes (`02-schema-tagged-errors`) so fallback predicates become tag/reason matching.
- Finally refactor failover and MFA strategy selection.
- Dependencies: `01-effect-fn-boundaries`; strongly benefits from `02-schema-tagged-errors`.
