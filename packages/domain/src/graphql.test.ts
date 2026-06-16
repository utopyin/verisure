import { test, describe, expect } from "vitest";

import {
  DefaultEventCategories,
  armAway,
  armHome,
  armState,
  climate,
  disarm,
  doorWindow,
  eventLog,
  fetchAllInstallations,
  smartLocks,
  smartPlugs,
} from "./graphql.ts";

describe("Verisure GraphQL builders", () => {
  test("builds fetchAllInstallations payload from Python source", () => {
    expect(fetchAllInstallations("user@example.com")).toStrictEqual({
      operationName: "fetchAllInstallations",
      query:
        "query fetchAllInstallations($email: String!){\n  account(email: $email) {\n    installations {\n      giid\n      alias\n      customerType\n      dealerId\n      subsidiary\n      pinCodeLength\n      locale\n      address {\n        street\n        city\n        postalNumber\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n",
      variables: { email: "user@example.com" },
    });
  });

  test("builds alarm state query payload", () => {
    expect(armState("GIID")).toStrictEqual({
      operationName: "ArmState",
      query:
        "query ArmState($giid: String!) {\n  installation(giid: $giid) {\n    armState {\n      type\n      statusType\n      date\n      name\n      changedVia\n      __typename\n    }\n    __typename\n  }\n}\n",
      variables: { giid: "GIID" },
    });
  });

  test("builds alarm mutation payloads", () => {
    expect(armAway({ code: "1234", giid: "GIID" })).toStrictEqual({
      operationName: "armAway",
      query:
        "mutation armAway($giid: String!, $code: String!) {\n  armStateArmAway(giid: $giid, code: $code)\n}\n",
      variables: { code: "1234", giid: "GIID" },
    });
    expect(armHome({ code: "1234", giid: "GIID" }).operationName).toBe(
      "armHome"
    );
    expect(disarm({ code: "1234", giid: "GIID" }).operationName).toBe("disarm");
  });

  test("builds device status query payloads", () => {
    expect({
      climate: climate("GIID"),
      doorWindow: doorWindow("GIID"),
      smartLocks: smartLocks("GIID"),
      smartPlugs: smartPlugs("GIID"),
    }).toStrictEqual({
      climate: expect.objectContaining({
        operationName: "Climate",
        query: expect.stringContaining("climates"),
      }),
      doorWindow: expect.objectContaining({
        operationName: "DoorWindow",
        query: expect.stringContaining("doorWindows"),
      }),
      smartLocks: expect.objectContaining({
        operationName: "SmartLock",
        query: expect.stringContaining("smartLocks"),
      }),
      smartPlugs: expect.objectContaining({
        operationName: "SmartPlug",
        query: expect.stringContaining("smartplugs"),
      }),
    });
  });

  test("builds event log with Python defaults", () => {
    expect(eventLog({ giid: "GIID" }).variables).toStrictEqual({
      eventCategories: DefaultEventCategories,
      eventContactIds: [],
      eventDeviceLabels: [],
      fromDate: null,
      giid: "GIID",
      offset: 0,
      pagesize: 15,
      toDate: null,
    });
  });
});
