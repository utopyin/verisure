# Findings audit progress

## what to do

- Compare the application code under `apps/` and `packages/` against idiomatic Effect guidance and fixtures from `repos/effect`.
- Record each non-idiomatic pattern in an ordered folder with an `index.md` and `progress.md`.
- Include concrete examples from this codebase and concrete references to Effect source/docs fixtures.
- Make dependency relationships between findings explicit.

## what is done

- Reviewed the Effect repo guidance in `repos/effect/LLMS.md` and examples under `repos/effect/ai-docs/src`.
- Scanned application Effect usage across HTTP, RPC, services, repositories, runtime wiring, Verisure integration, Drizzle adapter, and tests.
- Created ordered findings:
  1. `findings/01-effect-fn-boundaries` — effect-returning functions/constants are often anonymous `Effect.gen` instead of named `Effect.fn`.
  2. `findings/02-schema-tagged-errors` — application/domain errors are mostly `Data.TaggedError` rather than schema-backed error classes.
  3. `findings/03-error-control-flow` — some retry/fallback logic lowers typed failures into values and uses mutation/loops rather than Effect combinators.
  4. `findings/04-http-api-schema-first` — REST endpoints are manual router handlers instead of schema-first `HttpApi` groups.
  5. `findings/05-layer-composition-naming` — layers mix dependency-provided and no-deps variants inconsistently and sometimes hide requirements.
  6. `findings/06-effectful-drizzle-adapter` — Drizzle integration monkey-patches promise prototypes and uses runtime context mutation.
  7. `findings/07-test-harness-shape` — tests use `@effect/vitest`, but many test bodies contain nested programs and ad-hoc harness providers.
  8. `findings/08-composition-root-boundaries` — Worker composition mixes infrastructure, persistence, application services, and route dispatch.
  9. `findings/09-feature-slice-file-structure` — API files are organized mostly by transport/technical concern rather than feature/API group boundaries.
  10. `findings/10-http-rpc-error-boundaries` — HTTP/RPC error management is centralized but not contract-native and conflates some public/internal concerns.

## what is next

- Use these folders as a durable refactoring backlog.
- Recommended remediation order: 01 → 02 → 03 → 05 → 08 → 04 → 10 → 09 → 07, with 06 treated as a design spike because it is invasive.
- Follow-up pass added higher-level findings specifically for layer composition, file structure, and HTTP/RPC error boundaries.
- Finding 01 has been implemented for representative production boundaries.
- Finding 02 has migrated domain/server boundary errors from `Data.TaggedError` to `Schema.TaggedErrorClass`.
