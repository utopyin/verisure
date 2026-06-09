import { describe, expect, test } from "bun:test";
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
    expect(fetchAllInstallations("user@example.com")).toEqual({
      operationName: "fetchAllInstallations",
      variables: { email: "user@example.com" },
      query:
        "query fetchAllInstallations($email: String!){\n  account(email: $email) {\n    installations {\n      giid\n      alias\n      customerType\n      dealerId\n      subsidiary\n      pinCodeLength\n      locale\n      address {\n        street\n        city\n        postalNumber\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n",
    });
  });

  test("builds alarm state query payload", () => {
    expect(armState("GIID")).toEqual({
      operationName: "ArmState",
      variables: { giid: "GIID" },
      query:
        "query ArmState($giid: String!) {\n  installation(giid: $giid) {\n    armState {\n      type\n      statusType\n      date\n      name\n      changedVia\n      __typename\n    }\n    __typename\n  }\n}\n",
    });
  });

  test("builds alarm mutation payloads", () => {
    expect(armAway({ giid: "GIID", code: "1234" })).toEqual({
      operationName: "armAway",
      variables: { giid: "GIID", code: "1234" },
      query:
        "mutation armAway($giid: String!, $code: String!) {\n  armStateArmAway(giid: $giid, code: $code)\n}\n",
    });
    expect(armHome({ giid: "GIID", code: "1234" }).operationName).toBe("armHome");
    expect(disarm({ giid: "GIID", code: "1234" }).operationName).toBe("disarm");
  });

  test("builds device status query payloads", () => {
    expect(doorWindow("GIID").operationName).toBe("DoorWindow");
    expect(climate("GIID").operationName).toBe("Climate");
    expect(smartLocks("GIID").operationName).toBe("SmartLock");
    expect(smartPlugs("GIID").operationName).toBe("SmartPlug");
    expect(doorWindow("GIID").query).toContain("doorWindows");
    expect(climate("GIID").query).toContain("climates");
    expect(smartLocks("GIID").query).toContain("smartLocks");
    expect(smartPlugs("GIID").query).toContain("smartplugs");
  });

  test("builds event log with Python defaults", () => {
    expect(eventLog({ giid: "GIID" }).variables).toEqual({
      giid: "GIID",
      offset: 0,
      pagesize: 15,
      eventCategories: DefaultEventCategories,
      eventContactIds: [],
      eventDeviceLabels: [],
      fromDate: null,
      toDate: null,
    });
  });
});
