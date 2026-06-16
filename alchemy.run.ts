import { adopt } from "alchemy/AdoptPolicy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Workers from "alchemy/Cloudflare/Workers";
import * as Effect from "effect/Effect";
import ApiWorkerLayer, {
  ApiWorker,
  AppDb,
  VerisureCache,
} from "./apps/api/src/worker.ts";
import Web from "./apps/web/src/Web.ts";

export default Alchemy.Stack(
  "Verisure",
  {
    providers: Cloudflare.providers() as any,
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* ApiWorker;
    const web = yield* Web;
    const db = yield* AppDb;
    const cache = yield* VerisureCache;
    const zone = yield* Cloudflare.Zone("UtopyZone", {
      name: "utopy.sh",
    }).pipe(adopt(true));
    const apiRoute = yield* Workers.WorkerRoute("ApiRoute", {
      zoneId: zone.zoneId,
      pattern: "verisure.utopy.sh/api/*",
      script: api.workerName,
    }).pipe(adopt(true));

    return {
      apiUrl: api.url.as<string>(),
      webUrl: web.url.as<string>(),
      dbId: db.databaseId,
      cacheId: cache.namespaceId,
      apiRouteId: apiRoute.routeId,
    };
  }).pipe(Effect.provide(ApiWorkerLayer)),
);
