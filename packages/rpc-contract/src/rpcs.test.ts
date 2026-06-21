import { test, describe, expect } from "@effect/vitest";

import {
  AlarmRpcs,
  AuthRpcs,
  CredentialRpcs,
  DashboardRpcs,
  DeviceRpcs,
  InstallationRpcs,
  ShortcutRpcs,
} from ".";

const requestTags = (group: {
  readonly requests: ReadonlyMap<string, unknown>;
}) => [...group.requests.keys()].toSorted();

describe("dashboard RPC contract", () => {
  test("defines the expected dashboard RPC groups", () => {
    expect({
      alarm: requestTags(AlarmRpcs),
      auth: requestTags(AuthRpcs),
      credential: requestTags(CredentialRpcs),
      device: requestTags(DeviceRpcs),
      installation: requestTags(InstallationRpcs),
      shortcut: requestTags(ShortcutRpcs),
    }).toStrictEqual({
      alarm: [
        "Alarm.ArmAway",
        "Alarm.ArmHome",
        "Alarm.Disarm",
        "Alarm.GetArmState",
        "Alarm.SetAlarmMode",
        "Alarm.ToggleFullAlarm",
      ],
      auth: ["Auth.GetSession", "Auth.Logout"],
      credential: [
        "Credential.CreateCredential",
        "Credential.DeleteCredential",
        "Credential.ListCredentials",
        "Credential.RequestCredentialMfa",
        "Credential.ValidateCredentialMfa",
      ],
      device: [
        "Device.ListClimate",
        "Device.ListDoorWindows",
        "Device.ListSmartLocks",
        "Device.ListSmartPlugs",
      ],
      installation: [
        "Installation.ListInstallations",
        "Installation.SetDefaultInstallation",
      ],
      shortcut: [
        "Shortcut.ExportShortcut",
        "Shortcut.ListApiTokens",
        "Shortcut.RevokeApiToken",
      ],
    });
  });

  test("combines groups into a single dashboard contract", () => {
    expect(DashboardRpcs.requests.size).toBe(22);
    expect(DashboardRpcs.requests.has("Alarm.SetAlarmMode")).toBeTruthy();
    expect(DashboardRpcs.requests.has("Shortcut.ExportShortcut")).toBeTruthy();
  });

  test("leaves runtime auth middleware to API adapters", () => {
    for (const rpc of DashboardRpcs.requests.values()) {
      expect(rpc.middlewares.size).toBe(0);
    }
  });
});
