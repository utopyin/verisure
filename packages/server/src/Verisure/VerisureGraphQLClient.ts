import type {
  AlarmMode,
  AlarmMutationResult,
  ArmState,
  ClimateSensorStatus,
  DoorWindowSensorStatus,
  InstallationSummary,
  SmartLockStatus,
  SmartPlugStatus,
} from "@verisure/domain";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { CurrentCredential } from "../Security/RequestContext.ts";
import { VerisureGraphQL } from "./VerisureGraphQL.ts";
import type { VerisureGraphQLError } from "./VerisureGraphQL.ts";
import * as VerisureOperations from "./VerisureOperations.ts";

export interface VerisureGraphQLClientShape {
  readonly fetchAllInstallations: (input: {
    readonly email: string;
  }) => Effect.Effect<
    readonly InstallationSummary[],
    VerisureGraphQLError,
    CurrentCredential
  >;
  readonly armState: (input: {
    readonly giid: string;
  }) => Effect.Effect<ArmState, VerisureGraphQLError, CurrentCredential>;
  readonly setAlarmMode: (input: {
    readonly giid: string;
    readonly code: string;
    readonly mode: AlarmMode;
  }) => Effect.Effect<
    AlarmMutationResult,
    VerisureGraphQLError,
    CurrentCredential
  >;
  readonly doorWindows: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly DoorWindowSensorStatus[],
    VerisureGraphQLError,
    CurrentCredential
  >;
  readonly climate: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly ClimateSensorStatus[],
    VerisureGraphQLError,
    CurrentCredential
  >;
  readonly smartLocks: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly SmartLockStatus[],
    VerisureGraphQLError,
    CurrentCredential
  >;
  readonly smartPlugs: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly SmartPlugStatus[],
    VerisureGraphQLError,
    CurrentCredential
  >;
}

export class VerisureGraphQLClient extends Context.Service<
  VerisureGraphQLClient,
  VerisureGraphQLClientShape
>()("@verisure/server/VerisureGraphQLClient") {
  static readonly layer = Layer.effect(
    VerisureGraphQLClient,
    Effect.gen(function* makeVerisureGraphQLClient() {
      const graphql = yield* VerisureGraphQL;

      const fetchAllInstallations: VerisureGraphQLClientShape["fetchAllInstallations"] =
        (input) =>
          graphql.execute(VerisureOperations.fetchAllInstallations(input));

      const armState: VerisureGraphQLClientShape["armState"] = (input) =>
        graphql.execute(VerisureOperations.armState(input));

      const setAlarmMode: VerisureGraphQLClientShape["setAlarmMode"] = (
        input
      ) => graphql.execute(VerisureOperations.alarmModeMutation(input));

      const doorWindows: VerisureGraphQLClientShape["doorWindows"] = (input) =>
        graphql.execute(VerisureOperations.doorWindows(input));

      const climate: VerisureGraphQLClientShape["climate"] = (input) =>
        graphql.execute(VerisureOperations.climate(input));

      const smartLocks: VerisureGraphQLClientShape["smartLocks"] = (input) =>
        graphql.execute(VerisureOperations.smartLocks(input));

      const smartPlugs: VerisureGraphQLClientShape["smartPlugs"] = (input) =>
        graphql.execute(VerisureOperations.smartPlugs(input));

      return VerisureGraphQLClient.of({
        armState,
        climate,
        doorWindows,
        fetchAllInstallations,
        setAlarmMode,
        smartLocks,
        smartPlugs,
      });
    })
  );

  static readonly Live = this.layer.pipe(Layer.provide(VerisureGraphQL.Live));
}
