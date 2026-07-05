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
import { VerisureRequests } from "../Verisure/VerisureRequests";
import { ServiceUnavailable } from "./ServiceError";

export interface DeviceServiceShape {
  readonly listDoorWindows: Effect.Effect<
    readonly DoorWindowSensorStatus[],
    ServiceUnavailable,
    CurrentCredential | CurrentInstallation
  >;
  readonly listClimate: Effect.Effect<
    readonly ClimateSensorStatus[],
    ServiceUnavailable,
    CurrentCredential | CurrentInstallation
  >;
  readonly listSmartLocks: Effect.Effect<
    readonly SmartLockStatus[],
    ServiceUnavailable,
    CurrentCredential | CurrentInstallation
  >;
  readonly listSmartPlugs: Effect.Effect<
    readonly SmartPlugStatus[],
    ServiceUnavailable,
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
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to read door/window sensors",
            })
        ),
        Effect.withSpan("DeviceService.listDoorWindows")
      );

      const listClimate = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.climate({ giid });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to read climate sensors",
            })
        ),
        Effect.withSpan("DeviceService.listClimate")
      );

      const listSmartLocks = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.smartLocks({ giid });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to read smart locks",
            })
        ),
        Effect.withSpan("DeviceService.listSmartLocks")
      );

      const listSmartPlugs = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.smartPlugs({ giid });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to read smart plugs",
            })
        ),
        Effect.withSpan("DeviceService.listSmartPlugs")
      );

      return DeviceService.of({
        listClimate,
        listDoorWindows,
        listSmartLocks,
        listSmartPlugs,
      });
    })
  );
}
