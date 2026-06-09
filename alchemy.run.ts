import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle/Providers";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { VerisureSessionObject } from "./apps/api/src/SessionObject.ts";

export default Alchemy.Stack(
  "Verisure",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      Drizzle.providers(),
    ) as any,
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1Database("AppDb", {
      migrationsDir: "./packages/db/drizzle",
    });

    const email = yield* Cloudflare.SendEmail("Email");

    const sessions = Cloudflare.DurableObjectNamespace<VerisureSessionObject>(
      "VerisureSessionObject",
      {
        className: "VerisureSessionObject",
      },
    );

    const cache = yield* Cloudflare.KVNamespace("VerisureCache");

    const rateLimit = Cloudflare.RateLimit({
      name: "VERISURE_RATE_LIMIT",
      namespaceId: "verisure-api",
      simple: { limit: 60, period: 60 },
    });

    const api = yield* Cloudflare.Worker("Api", {
      main: "./apps/api/src/worker.ts",
      compatibility: {
        flags: ["nodejs_compat"],
      },
      observability: {
        enabled: true,
      },
      routes: [
        {
          pattern: "verisure.utopy.sh/api/*",
          zoneName: "utopy.sh",
        },
      ],
      env: {
        DB: db,
        EMAIL: email,
        VERISURE_SESSIONS: sessions,
        VERISURE_CACHE: cache,
        VERISURE_RATE_LIMIT: rateLimit,
        BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
        CREDENTIAL_ENCRYPTION_KEY: Config.redacted("CREDENTIAL_ENCRYPTION_KEY"),
        TOKEN_PEPPER: Config.redacted("TOKEN_PEPPER").pipe(Config.option),
      },
    });

    const web = yield* Cloudflare.Vite("Web", {
      rootDir: "./apps/web",
      compatibility: {
        flags: ["nodejs_compat"],
      },
      assets: {
        runWorkerFirst: true,
      },
      env: {
        VITE_API_BASE_URL: "/api",
      },
    });

    return {
      apiUrl: api.url.as<string>(),
      webUrl: web.url.as<string>(),
      dbId: db.databaseId,
      cacheId: cache.namespaceId,
    };
  }),
);
