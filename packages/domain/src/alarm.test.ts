import { test, describe, expect } from "vitest";

import {
  alarmModeToVerisureMutation,
  isAlarmMode,
  isShortcutAlarmMode,
  nextFullAlarmMode,
} from "./alarm.ts";
import { alarmModeMutation } from "./graphql.ts";

describe("alarm mode mapping", () => {
  test("recognizes dashboard and shortcut modes", () => {
    expect({
      isAlarmMode: {
        ARMED_AWAY: isAlarmMode("ARMED_AWAY"),
        ARMED_HOME: isAlarmMode("ARMED_HOME"),
        DISARMED: isAlarmMode("DISARMED"),
        NIGHT: isAlarmMode("NIGHT"),
      },
      isShortcutAlarmMode: {
        ARMED_AWAY: isShortcutAlarmMode("ARMED_AWAY"),
        ARMED_HOME: isShortcutAlarmMode("ARMED_HOME"),
        DISARMED: isShortcutAlarmMode("DISARMED"),
      },
    }).toStrictEqual({
      isAlarmMode: {
        ARMED_AWAY: true,
        ARMED_HOME: true,
        DISARMED: true,
        NIGHT: false,
      },
      isShortcutAlarmMode: {
        ARMED_AWAY: true,
        ARMED_HOME: false,
        DISARMED: true,
      },
    });
  });

  test("maps modes to Verisure mutation names", () => {
    expect(alarmModeToVerisureMutation("DISARMED")).toBe("disarm");
    expect(alarmModeToVerisureMutation("ARMED_AWAY")).toBe("armAway");
    expect(alarmModeToVerisureMutation("ARMED_HOME")).toBe("armHome");
  });

  test("maps modes to GraphQL mutations", () => {
    const input = { code: "1234", giid: "GIID" };
    expect(alarmModeMutation("DISARMED", input).operationName).toBe("disarm");
    expect(alarmModeMutation("ARMED_AWAY", input).operationName).toBe(
      "armAway"
    );
    expect(alarmModeMutation("ARMED_HOME", input).operationName).toBe(
      "armHome"
    );
  });

  test("toggles full alarm mode for Shortcut flow", () => {
    expect(nextFullAlarmMode("ARMED_AWAY")).toBe("DISARMED");
    expect(nextFullAlarmMode("DISARMED")).toBe("ARMED_AWAY");
    expect(nextFullAlarmMode("ARMED_HOME")).toBe("ARMED_AWAY");
  });
});
