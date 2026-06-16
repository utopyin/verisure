This repo hosts a Effect HTTP server that connects to Verisure non-official API and create authenticated sessions to change the alarm status and retrieve data.

## Vendored repos

Read libraries source code in repos/ as reference for writing idiomatic code.

- repos/effect: The missing standard library for Typescript. Everything must be written using Effect
- repos/alchemy: Effect-based Infrastructure as Code
- repos/verisure-python: Reverse enginneered of Verisure API. Take it as an initial inspiration, but I haven't reviewed the code and it may be trash.

## Type checking, testing, linting, formatting

Use `bun fix` to format and lint.

When you finished your work, use `bun check` to typecheck and lint.

Never typecheck a single package, always use `bun check` to typecheck using turborepo. Untouched packages are cached automatically, so this won't be costly.

For tests, use Vitest through the turborepo command using `bun run test` to run test on every package with a test script, or `vitest <args>` for specific test files. NEVER run `bun test` as this will use `bun:test` package. We only use Bun as the package manager.
