import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { ApiHttpApp } from "./Http/Routes";
import { ApiWorkerLayer } from "./layers";

export const ApiWorkerName = "verisure-api";

export default Cloudflare.Worker(
  "ApiWorker",
  {
    compatibility: { flags: ["nodejs_compat"] },
    main: import.meta.url,
    name: ApiWorkerName,
    observability: {
      enabled: true,
    },
  },
  Effect.gen(function* () {
    const app = yield* ApiHttpApp;

    return {
      fetch: app.fetch as never,
    };
  }).pipe(Effect.provide(ApiWorkerLayer)) as Effect.Effect<
    { readonly fetch: never },
    never,
    never
  >
);
