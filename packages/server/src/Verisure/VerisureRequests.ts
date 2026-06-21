import type {
  AlarmMode,
  AlarmMutationResult,
  ArmState,
  ClimateSensorStatus,
  DoorWindowSensorStatus,
  InstallationSummary,
  SmartLockStatus,
  SmartPlugStatus,
  VerisureDomainError,
} from "@verisure/domain";
import * as Domain from "@verisure/domain";
import { operation } from "@verisure/graphql-client";
import type { GraphQLOperation } from "@verisure/graphql-client";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import type { CurrentCredential } from "../Security/RequestContext";
import { fetchAllInstallationsOperation } from "./FetchAllInstallationsOperation";
import { VerisureAuth } from "./VerisureAuth";
import type { VerisureAuthError } from "./VerisureAuth";
import { VerisureTransport } from "./VerisureTransport";

export type VerisureRequestsError = VerisureAuthError | VerisureDomainError;

export interface VerisureRequestsShape {
  readonly fetchAllInstallations: (input: {
    readonly email: string;
  }) => Effect.Effect<
    readonly InstallationSummary[],
    VerisureRequestsError,
    CurrentCredential
  >;
  readonly armState: (input: {
    readonly giid: string;
  }) => Effect.Effect<ArmState, VerisureRequestsError, CurrentCredential>;
  readonly setAlarmMode: (input: {
    readonly giid: string;
    readonly code: string;
    readonly mode: AlarmMode;
  }) => Effect.Effect<
    AlarmMutationResult,
    VerisureRequestsError,
    CurrentCredential
  >;
  readonly doorWindows: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly DoorWindowSensorStatus[],
    VerisureRequestsError,
    CurrentCredential
  >;
  readonly climate: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly ClimateSensorStatus[],
    VerisureRequestsError,
    CurrentCredential
  >;
  readonly smartLocks: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly SmartLockStatus[],
    VerisureRequestsError,
    CurrentCredential
  >;
  readonly smartPlugs: (input: {
    readonly giid: string;
  }) => Effect.Effect<
    readonly SmartPlugStatus[],
    VerisureRequestsError,
    CurrentCredential
  >;
}

export class VerisureRequests extends Context.Service<
  VerisureRequests,
  VerisureRequestsShape
>()("@verisure/server/VerisureRequests") {
  static readonly layer = Layer.effect(
    VerisureRequests,
    Effect.gen(function* () {
      const auth = yield* VerisureAuth;
      const transport = yield* VerisureTransport;

      const executeWithSession = <A, V>(
        operation: Effect.Effect<GraphQLOperation<A, V>, Schema.SchemaError>
      ) =>
        Effect.gen(function* () {
          const builtOperation = yield* operation.pipe(
            Effect.mapError(operationInputError)
          );
          const session = yield* auth.ensureSession;
          return yield* transport.executeGraphQL({
            cookies: session.cookies,
            operation: builtOperation,
          });
        });

      return VerisureRequests.of({
        armState: (input) => executeWithSession(ArmState(input)),
        climate: (input) => executeWithSession(Climate(input)),
        doorWindows: (input) => executeWithSession(DoorWindows(input)),
        fetchAllInstallations: (input) =>
          executeWithSession(fetchAllInstallationsOperation(input)),
        setAlarmMode: (input) =>
          executeWithSession(alarmModeMutationOperation(input)),
        smartLocks: (input) => executeWithSession(SmartLocks(input)),
        smartPlugs: (input) => executeWithSession(SmartPlugs(input)),
      });
    })
  );

  static readonly Live = this.layer.pipe(
    Layer.provideMerge(
      VerisureAuth.Live.pipe(Layer.provideMerge(VerisureTransport.Live))
    )
  );
}

const optionalNullable = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(Schema.NullOr(schema)).pipe(
    Schema.decodeTo(Schema.optionalKey(Schema.toType(schema)), {
      decode: SchemaGetter.transformOptional(
        Option.filter(Predicate.isNotNull)
      ),
      encode: SchemaGetter.passthrough(),
    })
  );

const OptionalString = optionalNullable(Schema.String);
const OptionalNumber = optionalNullable(Schema.Finite);
const OptionalBoolean = optionalNullable(Schema.Boolean);

const ArmStatePayload = Schema.Struct({
  changedVia: OptionalString,
  date: OptionalString,
  name: OptionalString,
  statusType: OptionalString,
  type: Schema.String,
});

const ArmStateData = Schema.Struct({
  installation: Schema.Struct({ armState: ArmStatePayload }),
}).pipe(
  Schema.decodeTo(Domain.ArmStateSchema, {
    decode: SchemaGetter.transform((data) => data.installation.armState),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure arm state data is unsupported"
    ),
  })
);

const MutationResultPayload = Schema.NullOr(
  Schema.Union([
    Schema.Boolean,
    Schema.String,
    Schema.Struct({
      accepted: OptionalBoolean,
      transactionId: OptionalString,
    }),
  ])
);

type MutationResultPayload = Schema.Schema.Type<typeof MutationResultPayload>;

const AlarmMutationData = (field: string) =>
  Schema.Struct({ [field]: Schema.optionalKey(MutationResultPayload) }).pipe(
    Schema.decodeTo(Schema.optional(MutationResultPayload), {
      decode: SchemaGetter.transform((data) => data[field]),
      encode: SchemaGetter.forbidden(
        () => "Encoding Verisure alarm mutation data is unsupported"
      ),
    })
  );

const DeviceGuiPayload = Schema.Struct({ label: OptionalString });

const DeviceRefPayload = Schema.Struct({
  area: OptionalString,
  deviceLabel: Schema.String,
  label: OptionalString,
});

const DevicePayload = Schema.Struct({
  area: OptionalString,
  deviceLabel: Schema.String,
  gui: optionalNullable(DeviceGuiPayload),
}).pipe(
  Schema.decodeTo(DeviceRefPayload, {
    decode: SchemaGetter.transform((device) => ({
      ...optionalObjectField("area", device.area),
      deviceLabel: device.deviceLabel,
      ...optionalObjectField("label", device.gui?.label),
    })),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure device payloads is unsupported"
    ),
  })
);

const DoorWindowPayload = Schema.Struct({
  area: OptionalString,
  device: DevicePayload,
  reportTime: OptionalString,
  state: Schema.String,
  type: OptionalString,
  wired: OptionalBoolean,
});

const ClimatePayload = Schema.Struct({
  device: DevicePayload,
  humidityEnabled: OptionalBoolean,
  humidityTimestamp: OptionalString,
  humidityValue: OptionalNumber,
  temperatureTimestamp: OptionalString,
  temperatureValue: OptionalNumber,
});

const SmartLockPayload = Schema.Struct({
  device: DevicePayload,
  doorLockType: OptionalString,
  doorState: OptionalString,
  eventTime: OptionalString,
  lockMethod: OptionalString,
  lockStatus: OptionalString,
  secureMode: OptionalBoolean,
  user: optionalNullable(Schema.Struct({ name: OptionalString })),
}).pipe(
  Schema.decodeTo(Domain.SmartLockStatusSchema, {
    decode: SchemaGetter.transform((payload) => {
      const { user, ...status } = payload;
      return {
        ...status,
        ...optionalObjectField("userName", user?.name),
      };
    }),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure smart lock payloads is unsupported"
    ),
  })
);

const SmartPlugPayload = Schema.Struct({
  currentState: Schema.Union([Schema.Boolean, Schema.String]),
  device: DevicePayload,
  icon: OptionalString,
  isHazardous: OptionalBoolean,
});

const DoorWindowsData = Schema.Struct({
  installation: Schema.Struct({ doorWindows: Schema.Array(DoorWindowPayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(Domain.DoorWindowSensorStatusSchema), {
    decode: SchemaGetter.transform((data) => data.installation.doorWindows),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure door/window data is unsupported"
    ),
  })
);

const ClimateData = Schema.Struct({
  installation: Schema.Struct({ climates: Schema.Array(ClimatePayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(Domain.ClimateSensorStatusSchema), {
    decode: SchemaGetter.transform((data) => data.installation.climates),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure climate data is unsupported"
    ),
  })
);

const SmartLocksData = Schema.Struct({
  installation: Schema.Struct({ smartLocks: Schema.Array(SmartLockPayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(Domain.SmartLockStatusSchema), {
    decode: SchemaGetter.transform((data) => data.installation.smartLocks),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure smart lock data is unsupported"
    ),
  })
);

const SmartPlugsData = Schema.Struct({
  installation: Schema.Struct({ smartplugs: Schema.Array(SmartPlugPayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(Domain.SmartPlugStatusSchema), {
    decode: SchemaGetter.transform((data) => data.installation.smartplugs),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure smart plug data is unsupported"
    ),
  })
);

const ArmState = operation({
  data: ArmStateData,
  operationName: "ArmState",
  query: `query ArmState($giid: String!) {
  installation(giid: $giid) {
    armState {
      type
      statusType
      date
      name
      changedVia
      __typename
    }
    __typename
  }
}
`,
  variables: Schema.Struct({ giid: Schema.String }),
});

const ArmAway = operation({
  data: AlarmMutationData("armStateArmAway"),
  operationName: "armAway",
  query: `mutation armAway($giid: String!, $code: String!) {
  armStateArmAway(giid: $giid, code: $code)
}
`,
  variables: Schema.Struct({ code: Schema.String, giid: Schema.String }),
});

const ArmHome = operation({
  data: AlarmMutationData("armStateArmHome"),
  operationName: "armHome",
  query: `mutation armHome($giid: String!, $code: String!) {
  armStateArmHome(giid: $giid, code: $code)
}
`,
  variables: Schema.Struct({ code: Schema.String, giid: Schema.String }),
});

const Disarm = operation({
  data: AlarmMutationData("armStateDisarm"),
  operationName: "disarm",
  query: `mutation disarm($giid: String!, $code: String!) {
  armStateDisarm(giid: $giid, code: $code)
}
`,
  variables: Schema.Struct({ code: Schema.String, giid: Schema.String }),
});

const DoorWindows = operation({
  data: DoorWindowsData,
  operationName: "DoorWindow",
  query: `query DoorWindow($giid: String!) {
  installation(giid: $giid) {
    doorWindows {
      device {
        deviceLabel
        __typename
      }
      type
      area
      state
      wired
      reportTime
      __typename
    }
    __typename
  }
}
`,
  variables: Schema.Struct({ giid: Schema.String }),
});

const Climate = operation({
  data: ClimateData,
  operationName: "Climate",
  query: `query Climate($giid: String!) {
  installation(giid: $giid) {
    climates {
      device {
        deviceLabel
        area
        gui {
          label
          __typename
        }
        __typename
      }
      humidityEnabled
      humidityTimestamp
      humidityValue
      temperatureTimestamp
      temperatureValue
      thresholds {
        aboveMaxAlert
        belowMinAlert
        sensorType
        __typename
      }
      __typename
    }
    __typename
  }
}
`,
  variables: Schema.Struct({ giid: Schema.String }),
});

const SmartLocks = operation({
  data: SmartLocksData,
  operationName: "SmartLock",
  query: `query SmartLock($giid: String!) {
  installation(giid: $giid) {
    smartLocks {
      lockStatus
      doorState
      lockMethod
      eventTime
      doorLockType
      secureMode
      device {
        deviceLabel
        area
        __typename
      }
      user {
        name
        __typename
      }
      __typename
    }
    __typename
  }
}
`,
  variables: Schema.Struct({ giid: Schema.String }),
});

const SmartPlugs = operation({
  data: SmartPlugsData,
  operationName: "SmartPlug",
  query: `query SmartPlug($giid: String!) {
  installation(giid: $giid) {
    smartplugs {
      device {
        deviceLabel
        area
        __typename
      }
      currentState
      icon
      isHazardous
      __typename
    }
    __typename
  }
}
`,
  variables: Schema.Struct({ giid: Schema.String }),
});

const AlarmModeMutationInput = Schema.Struct({
  code: Schema.String,
  giid: Schema.String,
  mode: Domain.AlarmModeSchema,
});

const alarmModeMutationOperation = (input: {
  readonly giid: string;
  readonly code: string;
  readonly mode: AlarmMode;
}) =>
  Schema.decodeUnknownEffect(AlarmModeMutationInput)(input).pipe(
    Effect.flatMap((decodedInput) => {
      const variables = { code: decodedInput.code, giid: decodedInput.giid };
      const baseOperation = (() => {
        switch (decodedInput.mode) {
          case "DISARMED": {
            return Disarm(variables);
          }
          case "ARMED_AWAY": {
            return ArmAway(variables);
          }
          case "ARMED_HOME": {
            return ArmHome(variables);
          }
          default: {
            return Effect.die(
              new Error(`Unknown alarm mode: ${decodedInput.mode}`)
            );
          }
        }
      })();

      return baseOperation.pipe(
        Effect.map((operation) => ({
          ...operation,
          decode: (response: unknown) =>
            operation.decode(response).pipe(
              Effect.map((result) =>
                alarmMutationResult({
                  giid: decodedInput.giid,
                  mode: decodedInput.mode,
                  result,
                })
              )
            ),
        }))
      );
    })
  );

const alarmMutationResult = (input: {
  readonly giid: string;
  readonly mode: AlarmMode;
  readonly result?: MutationResultPayload;
}): AlarmMutationResult => {
  if (input.result === null || input.result === undefined) {
    return { accepted: true, giid: input.giid, requestedMode: input.mode };
  }
  if (typeof input.result === "boolean") {
    return {
      accepted: input.result,
      giid: input.giid,
      requestedMode: input.mode,
    };
  }
  if (typeof input.result === "string") {
    return {
      accepted: true,
      giid: input.giid,
      requestedMode: input.mode,
      transactionId: input.result,
    };
  }
  return {
    accepted: input.result.accepted ?? true,
    giid: input.giid,
    requestedMode: input.mode,
    ...optionalObjectField("transactionId", input.result.transactionId),
  };
};

const operationInputError = (cause: Schema.SchemaError) =>
  new Domain.ResponseError({
    message: "Failed to build Verisure GraphQL request",
    statusCode: 0,
    text: cause.message,
  });

const optionalObjectField = <K extends string, V>(
  key: K,
  value: V | undefined
) => (value === undefined ? {} : ({ [key]: value } as Record<K, V>));
