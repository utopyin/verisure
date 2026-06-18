import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { DatabaseLive } from "@verisure/db/cloudflare";
import { BetterAuthService, RuntimeConfig } from "@verisure/server";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { ApiMounts } from "./Http/App.ts";
import { VerisureSessionObjectLive } from "./SessionObject.ts";
import type { VerisureSessionObject } from "./SessionObject.ts";
import { VerisureSessionStoreLive } from "./SessionStoreLive.ts";

export const VerisureCache = Cloudflare.KVNamespace("VerisureCache");

export const VerisureRateLimit = Cloudflare.RateLimit({
  name: "VERISURE_RATE_LIMIT",
  namespaceId: "verisure-api",
  simple: { limit: 60, period: 60 },
});

export const ProductionApiWorkerName = "verisure-api" as const;

export class ApiWorker extends Cloudflare.Worker<
  ApiWorker,
  {},
  VerisureSessionObject
>()("Api", {
  compatibility: { flags: ["nodejs_compat"] },
  main: import.meta.filename,
  name: ProductionApiWorkerName,
  observability: {
    enabled: true,
  },
}) {}

export const ApiWorkerLive = Layer.mergeAll(
  BetterAuthService.Live,
  DatabaseLive,
  VerisureSessionStoreLive
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      VerisureSessionObjectLive,
      Cloudflare.KVNamespaceBindingLive,
      Cloudflare.RateLimitBindingLive,
      Cloudflare.D1ConnectionLive,
      RuntimeConfig.Live,
      BrowserCrypto.layer
    )
  )
);

export default ApiWorker.make(
  Effect.gen(function* () {
    const auth = yield* BetterAuthService;
    const _cache = yield* Cloudflare.KVNamespace.bind(VerisureCache);
    const _rateLimit = yield* VerisureRateLimit;

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest;
        const { pathname } = new URL(request.url, "http://localhost");

        if (request.method === "GET" && pathname === ApiMounts.health) {
          return yield* HttpServerResponse.json({
            ok: true,
            service: "verisure-api",
          });
        }

        if (pathname.startsWith("/api/auth")) {
          return yield* auth.fetch;
        }

        if (pathname.startsWith("/api/rpc")) {
          return yield* routePlaceholder("dashboard-rpc");
        }

        if (pathname.startsWith("/api/v1/")) {
          return yield* routePlaceholder("shortcut-rest");
        }

        return yield* HttpServerResponse.json(
          { error: "Not Found" },
          { status: 404 }
        );
      }),
    };
  }).pipe(Effect.provide(ApiWorkerLive))
);

const routePlaceholder = (name: string) =>
  HttpServerResponse.json(
    { route: name, status: "not-implemented" },
    { status: 501 }
  );
