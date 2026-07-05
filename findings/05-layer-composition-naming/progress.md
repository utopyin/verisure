# Progress — 05 Layer composition naming

## what to do

- Decide and document a layer naming convention.
- Split layers that both define implementation and provide infrastructure dependencies.
- Make testable no-deps variants easy to import.
- Ensure app root composition is the main place where production infrastructure is selected.

## what is done

- Identified examples in `VerisureTransport`, `CloudflareEmailLive`, `BetterAuthService`, and `Services/index.ts`.
- Compared with Effect layer-composition examples.
- Applied the naming split to infrastructure-facing layers:
  - `VerisureTransport.layerNoDeps(options)` now defines the implementation that requires `HttpClient.HttpClient`.
  - `VerisureTransport.layer(options)` provides `FetchHttpClient.layer`.
  - `VerisureTransport.Configured` builds the configured production transport from `RuntimeConfig`.
  - `VerisureTransport.Live` is retained as a compatibility alias for `Configured`.
  - `CloudflareEmailNoDeps` now defines the Cloudflare email implementation that requires the SendEmail binding service.
  - `CloudflareEmailLive` now only provides `Cloudflare.SendEmailBindingLive` to `CloudflareEmailNoDeps`.
  - `BetterAuthService.layerNoDeps` now defines the implementation requiring `RuntimeConfig`, `EmailService`, D1, and `RuntimeContext`.
  - `BetterAuthService.Live` now only provides `EmailLive` to `layerNoDeps`.
  - `VerisureRequests.layerNoDeps` now exposes the implementation requiring `VerisureAuth` and `VerisureTransport`; `layer` remains as a compatibility alias.
- Ran `bun fix`.
- Ran `bun check`; it still fails on pre-existing alchemy module/type issues outside this refactor.

## what is next

- Normalize repository naming (`Default` vs `Live`/`layerNoDeps`) in a later pass if desired.
- Consider moving broader production dependency provision from service `Live` layers into the API composition root when tackling `08-composition-root-boundaries`.
- Dependencies: `01-effect-fn-boundaries` is satisfied.
