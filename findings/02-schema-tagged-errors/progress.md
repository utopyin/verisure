# Progress — 02 Schema-tagged errors

## what to do

- Classify errors into boundary-crossing errors vs local/internal implementation errors.
- Convert boundary errors to `Schema.TaggedErrorClass`.
- Add explicit schemas/status annotations where errors are intended for HTTP/RPC responses.
- Update error handling to use `_tag`, `Effect.catchTag`, `Effect.catchTags`, or reason handling instead of relying on `instanceof` everywhere.

## what is done

- Identified all major `Data.TaggedError` locations.
- Compared with Effect app docs and HTTP fixtures.
- Documented why `Data.TaggedError` is not universally wrong, but is less idiomatic for this app's domain/API errors.
- Migrated the cross-package Verisure domain errors in `packages/domain/src/errors.ts` to `Schema.TaggedErrorClass`.
- Migrated server errors that can flow into HTTP/RPC/application boundaries to `Schema.TaggedErrorClass`:
  - `packages/server/src/Repositories/RepositoryError.ts`
  - `packages/server/src/Services/ServiceError.ts`
  - `packages/server/src/Services/ApiTokenService.ts` (`ApiTokenError`)
  - `packages/server/src/Auth/BetterAuthService.ts` (`AuthError`)
  - `packages/server/src/Email/EmailService.ts` (`EmailError`)
  - `packages/server/src/Security/CredentialCrypto.ts` (`CredentialCryptoError`)
  - `packages/server/src/Security/RequestContext.ts` (`ScopeError`)
  - `packages/server/src/Verisure/VerisureSessionStore.ts` (`VerisureSessionStoreError`)
- Removed remaining production `Data.TaggedError` usage under `packages/` and `apps/`.
- Ran `bun fix`.
- Ran `bun check`; it still fails on pre-existing alchemy module/type issues outside this refactor.

## what is next

- Coordinate with `04-http-api-schema-first` and `10-http-rpc-error-boundaries` to attach public HTTP status semantics to contract/API error schemas instead of relying on central mapping only.
- Consider converting `packages/contract/src/errors.ts` from manual `Schema.ErrorClass` + `_tag` fields to `Schema.TaggedErrorClass` during the HTTP/RPC contract pass if that improves consistency.
- Start `03-error-control-flow`; typed schema errors preserve `_tag` handling for `catchTag`/`catchTags` cleanup.
