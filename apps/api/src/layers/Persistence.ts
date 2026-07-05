import { DatabaseLive } from "@verisure/db/cloudflare";
import * as Server from "@verisure/server";
import * as Layer from "effect/Layer";

import { VerisureSessionStoreLive } from "../SessionStoreLive";

export const PersistenceLayer = Layer.mergeAll(
  Server.RepositoryLive,
  VerisureSessionStoreLive
).pipe(Layer.provideMerge(DatabaseLive));
