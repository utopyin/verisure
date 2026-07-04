import { layer as BrowserCryptoLayer } from "@effect/platform-browser/BrowserCrypto";
import { DatabaseLive } from "@verisure/db/cloudflare";
import * as Server from "@verisure/server";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { Url } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { ApiMounts } from "./Http/App";
import { ShortcutRestHttp } from "./Http/RestApi";
import { DashboardRpcHttp } from "./Http/RpcMount";
import { VerisureSessionObjectLive } from "./SessionObject";
import { VerisureSessionStoreLive } from "./SessionStoreLive";

export const ApiWorkerName = "verisure-api";

const InfraLayer = Layer.mergeAll(
  Cloudflare.KVNamespaceBindingLive,
  Cloudflare.RateLimitBindingLive,
  Cloudflare.D1ConnectionLive,
  VerisureSessionObjectLive,
  Server.RuntimeConfig.Live,
  BrowserCryptoLayer
);

const PersistenceLayer = Layer.mergeAll(
  Server.RepositoryLive,
  VerisureSessionStoreLive
).pipe(Layer.provideMerge(DatabaseLive));

export const ApiWorkerLayer = Layer.mergeAll(
  Server.ApplicationServicesLive,
  Server.BetterAuthService.Live
).pipe(Layer.provideMerge(PersistenceLayer), Layer.provideMerge(InfraLayer));

export default Cloudflare.Worker(
  "ApiWorker",
  {
    compatibility: { flags: ["nodejs_compat"] },
    main: import.meta.filename,
    name: ApiWorkerName,
    observability: {
      enabled: true,
    },
  },
  Effect.gen(function* () {
    const auth = yield* Server.BetterAuthService;
    const dashboardRpcHttp = yield* DashboardRpcHttp;
    const shortcutRestHttp = yield* ShortcutRestHttp;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const urlResult = Url.fromString(request.url);

        if (Result.isFailure(urlResult)) {
          return yield* HttpServerResponse.json(
            { error: "Invalid URL" },
            { status: 400 }
          );
        }

        const { pathname } = urlResult.success;

        if (request.method === "GET" && pathname === ApiMounts.health) {
          return yield* HttpServerResponse.json({
            ok: true,
            service: "verisure-api",
          });
        }

        if (pathname.startsWith("/api/auth")) {
          return yield* auth.fetch.pipe(
            Effect.catchTags({
              AuthError: (error) =>
                HttpServerResponse.json(
                  { error: error.message },
                  { status: 400 }
                ),
            })
          );
        }

        if (pathname.startsWith("/api/rpc")) {
          return yield* dashboardRpcHttp;
        }

        if (pathname.startsWith("/api/v1/")) {
          return yield* shortcutRestHttp;
        }

        return yield* HttpServerResponse.json(
          { error: "Not Found" },
          { status: 404 }
        );
      }),
    };
  }).pipe(Effect.provide(ApiWorkerLayer))
);
