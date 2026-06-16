import type { AlarmMode } from "./dto.ts";

export interface GraphQLOperation<
  Variables extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly operationName: string;
  readonly variables: Variables;
  readonly query: string;
}

export const buildGraphQLBatch = (
  ...operations: readonly GraphQLOperation[]
): readonly GraphQLOperation[] => operations;

export const fetchAllInstallations = (
  email: string
): GraphQLOperation<{ readonly email: string }> => ({
  operationName: "fetchAllInstallations",
  query:
    "query fetchAllInstallations($email: String!){\n  account(email: $email) {\n    installations {\n      giid\n      alias\n      customerType\n      dealerId\n      subsidiary\n      pinCodeLength\n      locale\n      address {\n        street\n        city\n        postalNumber\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: { email },
});

export const armState = (
  giid: string
): GraphQLOperation<{ readonly giid: string }> => ({
  operationName: "ArmState",
  query:
    "query ArmState($giid: String!) {\n  installation(giid: $giid) {\n    armState {\n      type\n      statusType\n      date\n      name\n      changedVia\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: { giid },
});

export const armAway = (input: {
  readonly giid: string;
  readonly code: string;
}): GraphQLOperation<{ readonly giid: string; readonly code: string }> => ({
  operationName: "armAway",
  query:
    "mutation armAway($giid: String!, $code: String!) {\n  armStateArmAway(giid: $giid, code: $code)\n}\n",
  variables: input,
});

export const armHome = (input: {
  readonly giid: string;
  readonly code: string;
}): GraphQLOperation<{ readonly giid: string; readonly code: string }> => ({
  operationName: "armHome",
  query:
    "mutation armHome($giid: String!, $code: String!) {\n  armStateArmHome(giid: $giid, code: $code)\n}\n",
  variables: input,
});

export const disarm = (input: {
  readonly giid: string;
  readonly code: string;
}): GraphQLOperation<{ readonly giid: string; readonly code: string }> => ({
  operationName: "disarm",
  query:
    "mutation disarm($giid: String!, $code: String!) {\n  armStateDisarm(giid: $giid, code: $code)\n}\n",
  variables: input,
});

export const alarmModeMutation = (
  mode: AlarmMode,
  input: { readonly giid: string; readonly code: string }
): GraphQLOperation<{ readonly giid: string; readonly code: string }> => {
  switch (mode) {
    case "DISARMED": {
      return disarm(input);
    }
    case "ARMED_AWAY": {
      return armAway(input);
    }
    case "ARMED_HOME": {
      return armHome(input);
    }
    default: {
      throw new Error(`Unknown alarm mode: ${mode}`);
    }
  }
};

export const doorWindow = (
  giid: string
): GraphQLOperation<{ readonly giid: string }> => ({
  operationName: "DoorWindow",
  query:
    "query DoorWindow($giid: String!) {\n  installation(giid: $giid) {\n    doorWindows {\n      device {\n        deviceLabel\n        __typename\n      }\n      type\n      area\n      state\n      wired\n      reportTime\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: { giid },
});

export const climate = (
  giid: string
): GraphQLOperation<{ readonly giid: string }> => ({
  operationName: "Climate",
  query:
    "query Climate($giid: String!) {\n  installation(giid: $giid) {\n    climates {\n      device {\n        deviceLabel\n        area\n        gui {\n          label\n          __typename\n        }\n        __typename\n      }\n      humidityEnabled\n      humidityTimestamp\n      humidityValue\n      temperatureTimestamp\n      temperatureValue\n      thresholds {\n        aboveMaxAlert\n        belowMinAlert\n        sensorType\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: { giid },
});

export const smartLocks = (
  giid: string
): GraphQLOperation<{ readonly giid: string }> => ({
  operationName: "SmartLock",
  query:
    "query SmartLock($giid: String!) {\n  installation(giid: $giid) {\n    smartLocks {\n      lockStatus\n      doorState\n      lockMethod\n      eventTime\n      doorLockType\n      secureMode\n      device {\n        deviceLabel\n        area\n        __typename\n      }\n      user {\n        name\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: { giid },
});

export const smartPlugs = (
  giid: string
): GraphQLOperation<{ readonly giid: string }> => ({
  operationName: "SmartPlug",
  query:
    "query SmartPlug($giid: String!) {\n  installation(giid: $giid) {\n    smartplugs {\n      device {\n        deviceLabel\n        area\n        __typename\n      }\n      currentState\n      icon\n      isHazardous\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: { giid },
});

export const smartPlug = (input: {
  readonly giid: string;
  readonly deviceLabel: string;
}): GraphQLOperation<{
  readonly giid: string;
  readonly deviceLabel: string;
}> => ({
  operationName: "SmartPlug",
  query:
    "query SmartPlug($giid: String!, $deviceLabel: String!) {\n  installation(giid: $giid) {\n    smartplugs(filter: {deviceLabels: [$deviceLabel]}) {\n      device {\n        deviceLabel\n        area\n        __typename\n      }\n      currentState\n      icon\n      isHazardous\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: input,
});

export const updateSmartPlugState = (input: {
  readonly giid: string;
  readonly deviceLabel: string;
  readonly state: boolean;
}): GraphQLOperation<{
  readonly giid: string;
  readonly deviceLabel: string;
  readonly state: boolean;
}> => ({
  operationName: "UpdateState",
  query:
    "mutation UpdateState($giid: String!, $deviceLabel: String!, $state: Boolean!) {\n  SmartPlugSetState(giid: $giid, input: [{deviceLabel: $deviceLabel, state: $state}])}",
  variables: input,
});

export const eventLog = (input: {
  readonly giid: string;
  readonly offset?: number;
  readonly pageSize?: number;
  readonly eventCategories?: readonly string[];
  readonly eventContactIds?: readonly string[];
  readonly eventDeviceLabels?: readonly string[];
  readonly fromDate?: string | null;
  readonly toDate?: string | null;
}): GraphQLOperation<{
  readonly giid: string;
  readonly offset: number;
  readonly pagesize: number;
  readonly eventCategories: readonly string[];
  readonly eventContactIds: readonly string[];
  readonly eventDeviceLabels: readonly string[];
  readonly fromDate: string | null;
  readonly toDate: string | null;
}> => ({
  operationName: "EventLog",
  query:
    "query EventLog($giid: String!, $offset: Int!, $pagesize: Int!, $eventCategories: [String], $fromDate: String, $toDate: String, $eventContactIds: [String], $eventDeviceLabels: [String]) {\n  installation(giid: $giid) {\n    eventLog(offset: $offset, pagesize: $pagesize, eventCategories: $eventCategories, eventContactIds: $eventContactIds, eventDeviceLabels: $eventDeviceLabels, fromDate: $fromDate, toDate: $toDate) {\n      moreDataAvailable\n      pagedList {\n        device {\n          deviceLabel\n          area\n          gui {\n            label\n            __typename\n          }\n          __typename\n        }\n        arloDevice {\n          name\n          __typename\n        }\n        gatewayArea\n        eventType\n        eventCategory\n        eventSource\n        eventId\n        eventTime\n        userName\n        armState\n        userType\n        climateValue\n        sensorType\n        eventCount\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: {
    eventCategories: input.eventCategories ?? DefaultEventCategories,
    eventContactIds: input.eventContactIds ?? [],
    eventDeviceLabels: input.eventDeviceLabels ?? [],
    fromDate: input.fromDate ?? null,
    giid: input.giid,
    offset: input.offset ?? 0,
    pagesize: input.pageSize ?? 15,
    toDate: input.toDate ?? null,
  },
});

export const DefaultEventCategories = [
  "INTRUSION",
  "FIRE",
  "SOS",
  "WATER",
  "ANIMAL",
  "TECHNICAL",
  "WARNING",
  "ARM",
  "DISARM",
  "LOCK",
  "UNLOCK",
  "PICTURE",
  "CLIMATE",
  "CAMERA_SETTINGS",
] as const;
