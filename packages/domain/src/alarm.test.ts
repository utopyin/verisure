import { describe, expect, test } from "bun:test";
import {
  alarmModeToVerisureMutation,
  isAlarmMode,
  isShortcutAlarmMode,
  nextFullAlarmMode,
} from "./alarm.ts";
import { alarmModeMutation } from "./graphql.ts";

describe("alarm mode mapping", () => {
  test("recognizes dashboard and shortcut modes", () => {
    expect(isAlarmMode("DISARMED")).toBe(true);
    expect(isAlarmMode("ARMED_AWAY")).toBe(true);
    expect(isAlarmMode("ARMED_HOME")).toBe(true);
    expect(isAlarmMode("NIGHT")).toBe(false);

    expect(isShortcutAlarmMode("DISARMED")).toBe(true);
    expect(isShortcutAlarmMode("ARMED_AWAY")).toBe(true);
    expect(isShortcutAlarmMode("ARMED_HOME")).toBe(false);
  });

  test("maps modes to Verisure mutation names", () => {
    expect(alarmModeToVerisureMutation("DISARMED")).toBe("disarm");
    expect(alarmModeToVerisureMutation("ARMED_AWAY")).toBe("armAway");
    expect(alarmModeToVerisureMutation("ARMED_HOME")).toBe("armHome");
  });

  test("maps modes to GraphQL mutations", () => {
    const input = { giid: "GIID", code: "1234" };
    expect(alarmModeMutation("DISARMED", input).operationName).toBe("disarm");
    expect(alarmModeMutation("ARMED_AWAY", input).operationName).toBe("armAway");
    expect(alarmModeMutation("ARMED_HOME", input).operationName).toBe("armHome");
  });

  test("toggles full alarm mode for Shortcut flow", () => {
    expect(nextFullAlarmMode("ARMED_AWAY")).toBe("DISARMED");
    expect(nextFullAlarmMode("DISARMED")).toBe("ARMED_AWAY");
    expect(nextFullAlarmMode("ARMED_HOME")).toBe("ARMED_AWAY");
  });
});
