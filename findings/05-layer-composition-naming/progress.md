# Progress — 05 Layer composition naming

## what to do

- Decide and document a layer naming convention.
- Split layers that both define implementation and provide infrastructure dependencies.
- Make testable no-deps variants easy to import.
- Ensure app root composition is the main place where production infrastructure is selected.

## what is done

- Identified examples in `VerisureTransport`, `CloudflareEmailLive`, `BetterAuthService`, and `Services/index.ts`.
- Compared with Effect layer-composition examples.

## what is next

- Apply convention first to infrastructure-facing services (`VerisureTransport`, email, BetterAuth).
- Then normalize repositories/services.
- Dependencies: benefits from `01-effect-fn-boundaries`; independent of `02-schema-tagged-errors`.
