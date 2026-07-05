import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";

import { AuthMiddleware } from "./AuthMiddleware";
import { toDashboardRpcError } from "./ErrorMapper";
import {
  CredentialScopeMiddleware,
  InstallationScopeMiddleware,
} from "./ScopeMiddleware";

export const Rpcs = RpcContract.DeviceRpcs.middleware(
  InstallationScopeMiddleware
)
  .middleware(CredentialScopeMiddleware)
  .middleware(AuthMiddleware);

export const deviceHandlers = Effect.gen(function* () {
  const device = yield* Server.DeviceService;

  return Rpcs.of({
    "Device.ListClimate": () =>
      device.listClimate.pipe(Effect.mapError(toDashboardRpcError)),
    "Device.ListDoorWindows": () =>
      device.listDoorWindows.pipe(Effect.mapError(toDashboardRpcError)),
    "Device.ListSmartLocks": () =>
      device.listSmartLocks.pipe(Effect.mapError(toDashboardRpcError)),
    "Device.ListSmartPlugs": () =>
      device.listSmartPlugs.pipe(Effect.mapError(toDashboardRpcError)),
  });
});
