# Progress — 01 Effect.fn boundaries

## what to do

- Inventory service methods and helpers that return `Effect.gen`.
- Convert stable parameterized boundaries to `Effect.fn("Qualified.name")`.
- Name immediate `Effect` values with `Effect.withSpan("Qualified.name")` rather than `Effect.fn(... )()`.
- Keep one-off `Effect.gen` only for local sequential composition.
- Use consistent names matching service and method names.

## what is done

- Identified representative files: `AlarmService.ts`, `CredentialService.ts`, `DeviceService.ts`, `VerisureAuth.ts`, `SessionStoreLive.ts`.
- Compared with `repos/effect/LLMS.md`, `01_effect/01_basics/02_effect-fn.ts`, and service fixtures.
- Refactored parameterized service/private boundaries to named `Effect.fn` in:
  - `packages/server/src/Services/AlarmService.ts`
  - `packages/server/src/Services/CredentialService.ts`
  - `packages/server/src/Services/InstallationService.ts`
  - `packages/server/src/Verisure/VerisureAuth.ts`
  - `packages/server/src/Verisure/VerisureSessionStore.ts`
  - `apps/api/src/SessionStoreLive.ts`
- Added named spans to immediate `Effect`-valued service properties in:
  - `packages/server/src/Services/AlarmService.ts`
  - `packages/server/src/Services/CredentialService.ts`
  - `packages/server/src/Services/DeviceService.ts`
  - `packages/server/src/Services/InstallationService.ts`
  - `packages/server/src/Verisure/VerisureAuth.ts`
  - `packages/server/src/Verisure/VerisureSessionStore.ts`
  - `apps/api/src/SessionStoreLive.ts`
- Ran `bun fix`.
- Ran `bun check`; it still fails on pre-existing alchemy module/type issues outside this refactor, but the new Effect.fn IIFE warnings were eliminated.

## what is next

- Continue the same naming pattern in RPC handler factory effects and tests when tackling `07-test-harness-shape`.
- Use this clearer operation naming as groundwork for `03-error-control-flow`.
- Dependencies: none. This finding is implemented for the representative production boundaries from the audit.
