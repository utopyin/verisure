# Progress — 07 Test harness shape

## what to do

- Simplify tests to one main `Effect.gen` per `it.effect` where possible.
- Extract reused test operations into named `Effect.fn` helpers.
- Normalize harness providers/layers across service and Verisure tests.

## what is done

- Confirmed tests already use `@effect/vitest`.
- Identified nested effect/provider patterns in service, Verisure, and RPC tests.
- Compared with Effect testing docs.

## what is next

- After `01-effect-fn-boundaries`, refactor test helpers to mirror production service method names.
- Do not change tests first; use them to protect production refactors.
- Dependencies: `01-effect-fn-boundaries`; optional dependency on `05-layer-composition-naming` for cleaner test layers.
