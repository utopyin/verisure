import * as Cloudflare from "alchemy/Cloudflare";
import { DatabaseLive } from "@verisure/db/cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { ApiMounts } from "./Http/App.ts";
import {
  VerisureSessionObject,
  VerisureSessionObjectLive,
} from "./SessionObject.ts";

export const Email = Cloudflare.SendEmail("Email");

export const VerisureCache = Cloudflare.KVNamespace("VerisureCache");

export const VerisureRateLimit = Cloudflare.RateLimit({
  name: "VERISURE_RATE_LIMIT",
  namespaceId: "verisure-api",
  simple: { limit: 60, period: 60 },
});

export class ApiWorker extends Cloudflare.Worker<
  ApiWorker,
  {},
  VerisureSessionObject
>()(
  "Api",
  {
    main: import.meta.filename,
    compatibility: {
      flags: ["nodejs_compat"],
    },
    observability: {
      enabled: true,
    },
    env: {
      BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
      CREDENTIAL_ENCRYPTION_KEY: Config.redacted("CREDENTIAL_ENCRYPTION_KEY"),
      TOKEN_PEPPER: Config.redacted("TOKEN_PEPPER").pipe(Config.option),
    },
  },
) {}

export default ApiWorker.make(
  Effect.gen(function* () {
    const _email = yield* Cloudflare.SendEmail.bind(Email);
    const _sessions = yield* VerisureSessionObject.from(ApiWorker);
    const _cache = yield* Cloudflare.KVNamespace.bind(VerisureCache);
    const _rateLimit = yield* VerisureRateLimit;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === ApiMounts.health) {
          return yield* HttpServerResponse.json({
            ok: true,
            service: "verisure-api",
          });
        }

        if (url.pathname.startsWith("/api/auth/")) {
          return yield* routePlaceholder("better-auth");
        }

        if (url.pathname.startsWith("/api/rpc")) {
          return yield* routePlaceholder("dashboard-rpc");
        }

        if (url.pathname.startsWith("/api/v1/")) {
          return yield* routePlaceholder("shortcut-rest");
        }

        return yield* HttpServerResponse.json(
          { error: "Not Found" },
          { status: 404 },
        );
      }),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        DatabaseLive.pipe(Layer.provide(Cloudflare.D1ConnectionLive)),
        Cloudflare.SendEmailBindingLive,
        Cloudflare.KVNamespaceBindingLive,
        Cloudflare.RateLimitBindingLive,
        VerisureSessionObjectLive,
      ),
    ),
  ),
);

const routePlaceholder = (name: string) =>
  HttpServerResponse.json(
    { route: name, status: "not-implemented" },
    { status: 501 },
  );
