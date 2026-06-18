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
import * as DomainGraphQL from "@verisure/domain";
import { operation } from "@verisure/graphql-client";
import type { GraphQLOperation } from "@verisure/graphql-client";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

export type VerisureOperation<A, V> = GraphQLOperation<A, V>;

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
const OptionalNumber = optionalNullable(Schema.Number);
const OptionalBoolean = optionalNullable(Schema.Boolean);

const InstallationAddressPayload = Schema.Struct({
  city: OptionalString,
  postalNumber: OptionalString,
  street: OptionalString,
});

const InstallationPayload = Schema.Struct({
  address: optionalNullable(InstallationAddressPayload),
  alias: Schema.String,
  customerType: OptionalString,
  dealerId: OptionalString,
  giid: Schema.String,
  locale: OptionalString,
  pinCodeLength: OptionalNumber,
  subsidiary: OptionalString,
}) satisfies Schema.Schema<InstallationSummary>;

const InstallationsData = Schema.Struct({
  account: Schema.Struct({
    installations: Schema.Array(InstallationPayload),
  }),
}).pipe(
  Schema.decodeTo(Schema.Array(InstallationPayload), {
    decode: SchemaGetter.transform((data) => data.account.installations),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure installations data is unsupported"
    ),
  })
);

const ArmStatePayload = Schema.Struct({
  changedVia: OptionalString,
  date: OptionalString,
  name: OptionalString,
  statusType: OptionalString,
  type: Schema.String,
}) satisfies Schema.Schema<ArmState>;

const ArmStateData = Schema.Struct({
  installation: Schema.Struct({ armState: ArmStatePayload }),
}).pipe(
  Schema.decodeTo(ArmStatePayload, {
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

export type MutationResultPayload = Schema.Schema.Type<
  typeof MutationResultPayload
>;

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
}) satisfies Schema.Schema<DoorWindowSensorStatus>;

const ClimatePayload = Schema.Struct({
  device: DevicePayload,
  humidityEnabled: OptionalBoolean,
  humidityTimestamp: OptionalString,
  humidityValue: OptionalNumber,
  temperatureTimestamp: OptionalString,
  temperatureValue: OptionalNumber,
}) satisfies Schema.Schema<ClimateSensorStatus>;

const SmartLockStatusPayload = Schema.Struct({
  device: DevicePayload,
  doorLockType: OptionalString,
  doorState: OptionalString,
  eventTime: OptionalString,
  lockMethod: OptionalString,
  lockStatus: OptionalString,
  secureMode: OptionalBoolean,
  userName: OptionalString,
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
  Schema.decodeTo(SmartLockStatusPayload, {
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
) satisfies Schema.Schema<SmartLockStatus>;

const SmartPlugPayload = Schema.Struct({
  currentState: Schema.Union([Schema.Boolean, Schema.String]),
  device: DevicePayload,
  icon: OptionalString,
  isHazardous: OptionalBoolean,
}) satisfies Schema.Schema<SmartPlugStatus>;

const DoorWindowsData = Schema.Struct({
  installation: Schema.Struct({ doorWindows: Schema.Array(DoorWindowPayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(DoorWindowPayload), {
    decode: SchemaGetter.transform((data) => data.installation.doorWindows),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure door/window data is unsupported"
    ),
  })
);

const ClimateData = Schema.Struct({
  installation: Schema.Struct({ climates: Schema.Array(ClimatePayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(ClimatePayload), {
    decode: SchemaGetter.transform((data) => data.installation.climates),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure climate data is unsupported"
    ),
  })
);

const SmartLocksData = Schema.Struct({
  installation: Schema.Struct({ smartLocks: Schema.Array(SmartLockPayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(SmartLockPayload), {
    decode: SchemaGetter.transform((data) => data.installation.smartLocks),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure smart lock data is unsupported"
    ),
  })
);

const SmartPlugsData = Schema.Struct({
  installation: Schema.Struct({ smartplugs: Schema.Array(SmartPlugPayload) }),
}).pipe(
  Schema.decodeTo(Schema.Array(SmartPlugPayload), {
    decode: SchemaGetter.transform((data) => data.installation.smartplugs),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure smart plug data is unsupported"
    ),
  })
);

const FetchAllInstallations = operation({
  data: InstallationsData,
  operationName: "fetchAllInstallations",
  query: DomainGraphQL.fetchAllInstallations("").query,
  variables: Schema.Struct({ email: Schema.String }),
});

const ArmState = operation({
  data: ArmStateData,
  operationName: "ArmState",
  query: DomainGraphQL.armState("").query,
  variables: Schema.Struct({ giid: Schema.String }),
});

const ArmAway = operation({
  data: AlarmMutationData("armStateArmAway"),
  operationName: "armAway",
  query: DomainGraphQL.armAway({ code: "", giid: "" }).query,
  variables: Schema.Struct({ code: Schema.String, giid: Schema.String }),
});

const ArmHome = operation({
  data: AlarmMutationData("armStateArmHome"),
  operationName: "armHome",
  query: DomainGraphQL.armHome({ code: "", giid: "" }).query,
  variables: Schema.Struct({ code: Schema.String, giid: Schema.String }),
});

const Disarm = operation({
  data: AlarmMutationData("armStateDisarm"),
  operationName: "disarm",
  query: DomainGraphQL.disarm({ code: "", giid: "" }).query,
  variables: Schema.Struct({ code: Schema.String, giid: Schema.String }),
});

const DoorWindows = operation({
  data: DoorWindowsData,
  operationName: "DoorWindow",
  query: DomainGraphQL.doorWindow("").query,
  variables: Schema.Struct({ giid: Schema.String }),
});

const Climate = operation({
  data: ClimateData,
  operationName: "Climate",
  query: DomainGraphQL.climate("").query,
  variables: Schema.Struct({ giid: Schema.String }),
});

const SmartLocks = operation({
  data: SmartLocksData,
  operationName: "SmartLock",
  query: DomainGraphQL.smartLocks("").query,
  variables: Schema.Struct({ giid: Schema.String }),
});

const SmartPlugs = operation({
  data: SmartPlugsData,
  operationName: "SmartPlug",
  query: DomainGraphQL.smartPlugs("").query,
  variables: Schema.Struct({ giid: Schema.String }),
});

export const fetchAllInstallations = FetchAllInstallations;
export const armState = ArmState;
export const doorWindows = DoorWindows;
export const climate = Climate;
export const smartLocks = SmartLocks;
export const smartPlugs = SmartPlugs;

export const alarmModeMutation = (input: {
  readonly giid: string;
  readonly code: string;
  readonly mode: AlarmMode;
}) => {
  const variables = { code: input.code, giid: input.giid };
  const baseOperation = (() => {
    switch (input.mode) {
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
        throw new Error(`Unknown alarm mode: ${input.mode}`);
      }
    }
  })();

  return {
    ...baseOperation,
    decode: (response: unknown) =>
      baseOperation.decode(response).pipe(
        Effect.map((result) =>
          alarmMutationResult({
            giid: input.giid,
            mode: input.mode,
            result,
          })
        )
      ),
  };
};

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

const optionalObjectField = <K extends string, V>(
  key: K,
  value: V | undefined
) => (value === undefined ? {} : ({ [key]: value } as Record<K, V>));
