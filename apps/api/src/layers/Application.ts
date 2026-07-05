import * as Server from "@verisure/server";
import * as Layer from "effect/Layer";

import { ApiHttpAppLive } from "../Http/Routes";
import { InfrastructureLayer } from "./Infrastructure";
import { PersistenceLayer } from "./Persistence";

const ApplicationServicesLayer = Layer.mergeAll(
  Server.ApplicationServicesLive,
  Server.BetterAuthService.Live
);

const ApplicationLayer = ApiHttpAppLive.pipe(
  Layer.provideMerge(ApplicationServicesLayer),
  Layer.provideMerge(PersistenceLayer)
);

export const ApiWorkerLayer = ApplicationLayer.pipe(
  Layer.provideMerge(InfrastructureLayer)
);
