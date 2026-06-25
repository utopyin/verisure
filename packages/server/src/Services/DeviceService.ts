import type {
  ClimateSensorStatus,
  DoorWindowSensorStatus,
  SmartLockStatus,
  SmartPlugStatus,
} from "@verisure/domain";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { CurrentCredential } from "../Security/RequestContext";
import { CurrentInstallation } from "../Security/RequestContext";
import type { VerisureRequestsError } from "../Verisure/VerisureRequests";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import type { ServiceError } from "./ServiceError";

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
  static readonly Test = (
    options: {
      readonly climate?: readonly ClimateSensorStatus[];
      readonly doorWindows?: readonly DoorWindowSensorStatus[];
      readonly smartLocks?: readonly SmartLockStatus[];
      readonly smartPlugs?: readonly SmartPlugStatus[];
    } = {}
  ) =>
    Layer.succeed(
      DeviceService,
      DeviceService.of({
        listClimate: CurrentInstallation.pipe(Effect.as(options.climate ?? [])),
        listDoorWindows: CurrentInstallation.pipe(
          Effect.as(options.doorWindows ?? [])
        ),
        listSmartLocks: CurrentInstallation.pipe(
          Effect.as(options.smartLocks ?? [])
        ),
        listSmartPlugs: CurrentInstallation.pipe(
          Effect.as(options.smartPlugs ?? [])
        ),
      })
    );

  static readonly Live = Layer.effect(
    DeviceService,
    Effect.gen(function* () {
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
