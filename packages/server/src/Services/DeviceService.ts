import type {
  ClimateSensorStatus,
  DoorWindowSensorStatus,
  SmartLockStatus,
  SmartPlugStatus,
} from "@verisure/domain";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { CurrentCredential } from "../Security/RequestContext.ts";
import { CurrentInstallation } from "../Security/RequestContext.ts";
import { VerisureRequests } from "../Verisure/VerisureRequests.ts";
import type { VerisureRequestsError } from "../Verisure/VerisureRequests.ts";
import type { ServiceError } from "./ServiceError.ts";

export type DeviceServiceError = ServiceError | VerisureRequestsError;

export interface DeviceServiceShape {
  readonly listDoorWindows: Effect.Effect<
    readonly DoorWindowSensorStatus[],
    DeviceServiceError,
    CurrentCredential | CurrentInstallation
  >;
  readonly listClimate: Effect.Effect<
    readonly ClimateSensorStatus[],
    DeviceServiceError,
    CurrentCredential | CurrentInstallation
  >;
  readonly listSmartLocks: Effect.Effect<
    readonly SmartLockStatus[],
    DeviceServiceError,
    CurrentCredential | CurrentInstallation
  >;
  readonly listSmartPlugs: Effect.Effect<
    readonly SmartPlugStatus[],
    DeviceServiceError,
    CurrentCredential | CurrentInstallation
  >;
}

export class DeviceService extends Context.Service<
  DeviceService,
  DeviceServiceShape
>()("@verisure/server/DeviceService") {
  static readonly Live = Layer.effect(
    DeviceService,
    Effect.gen(function* makeDeviceService() {
      const requests = yield* VerisureRequests;
      const currentGiid = CurrentInstallation.pipe(
        Effect.map((installation) => installation.giid)
      );

      const listDoorWindows = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.doorWindows({ giid });
      });

      const listClimate = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.climate({ giid });
      });

      const listSmartLocks = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.smartLocks({ giid });
      });

      const listSmartPlugs = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.smartPlugs({ giid });
      });

      return DeviceService.of({
        listClimate,
        listDoorWindows,
        listSmartLocks,
        listSmartPlugs,
      });
    })
  );
}
