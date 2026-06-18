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
import type { VerisureGraphQLError } from "../Verisure/VerisureGraphQL.ts";
import { VerisureGraphQLClient } from "../Verisure/VerisureGraphQLClient.ts";
import type { ServiceError } from "./ServiceError.ts";

export type DeviceServiceError = ServiceError | VerisureGraphQLError;

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
      const graphql = yield* VerisureGraphQLClient;
      const currentGiid = CurrentInstallation.pipe(
        Effect.map((installation) => installation.giid)
      );

      const listDoorWindows = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* graphql.doorWindows({ giid });
      });

      const listClimate = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* graphql.climate({ giid });
      });

      const listSmartLocks = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* graphql.smartLocks({ giid });
      });

      const listSmartPlugs = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* graphql.smartPlugs({ giid });
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
