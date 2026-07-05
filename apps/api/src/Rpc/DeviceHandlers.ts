import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";

import { AuthMiddleware } from "./AuthMiddleware";
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
      device.listClimate.pipe(
        Effect.catchTag("ServiceUnavailable", (error) =>
          Effect.fail(
            new RpcContract.DeviceReadUnavailable({ message: error.message })
          )
        )
      ),
    "Device.ListDoorWindows": () =>
      device.listDoorWindows.pipe(
        Effect.catchTag("ServiceUnavailable", (error) =>
          Effect.fail(
            new RpcContract.DeviceReadUnavailable({ message: error.message })
          )
        )
      ),
    "Device.ListSmartLocks": () =>
      device.listSmartLocks.pipe(
        Effect.catchTag("ServiceUnavailable", (error) =>
          Effect.fail(
            new RpcContract.DeviceReadUnavailable({ message: error.message })
          )
        )
      ),
    "Device.ListSmartPlugs": () =>
      device.listSmartPlugs.pipe(
        Effect.catchTag("ServiceUnavailable", (error) =>
          Effect.fail(
            new RpcContract.DeviceReadUnavailable({ message: error.message })
          )
        )
      ),
  });
});
