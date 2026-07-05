import { D1Database as AppDb } from "@verisure/db/cloudflare";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Workers from "alchemy/Cloudflare/Workers";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import ApiWorker, { ApiWorkerName } from "./apps/api/src/worker";
import Web from "./apps/web/src/Web";

export default Alchemy.Stack(
  "Verisure",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* ApiWorker;
    const web = yield* Web;
    const db = yield* AppDb;
    const context = yield* Alchemy.AlchemyContext;
    const apiRouteId = context.dev
      ? undefined
      : yield* Effect.gen(function* () {
          const zone = yield* Cloudflare.Zone.Zone("UtopyZone", {
            name: "utopy.sh",
          }).pipe(adopt(true));
          const apiRoute = yield* Workers.WorkerRoute("ApiRoute", {
            pattern: "verisure.utopy.sh/api/*",
            script: ApiWorkerName,
            zoneId: zone.zoneId,
          }).pipe(adopt(true));
          return apiRoute.routeId;
        });

    return {
      apiRouteId,
      apiUrl: api.url.as<string>(),
      dbId: db.databaseId,
      webUrl: web.url.as<string>(),
    };
  })
);
