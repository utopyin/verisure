# Progress — 07 Test harness shape

## what to do

- Keep future tests in the one-main-`Effect.gen` style used by the Effect testing fixtures.
- Consider a separate API/RPC test cleanup only if it can be done without widening production or REST/RPC scope.

## what is done

- Confirmed tests already use `@effect/vitest`.
- Identified nested effect/provider patterns in service, Verisure, and RPC tests.
- Compared with Effect testing docs.
- Simplified the targeted server test harnesses by extracting named local `Effect.fn` helpers for service and Verisure operations, while preserving per-test harness state, fixture data, and assertions.
- Left broad API/RPC test cleanup deferred because this slice was scoped to the server harness shape.

## what is next

- Address any unrelated runtime/typecheck failures separately before using these server tests as a green CI gate.
- Keep mutable test queues/arrays per test; do not introduce shared layers for those harnesses.
