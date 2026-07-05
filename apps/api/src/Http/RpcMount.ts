import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import { HandlersLive, Rpcs } from "../Rpc";

export const DashboardRpcHttp = RpcServer.toHttpEffect(Rpcs, {
  spanPrefix: "DashboardRpc",
}).pipe(
  Effect.provide(
    HandlersLive.pipe(Layer.provideMerge(RpcSerialization.layerNdjson))
  )
);
