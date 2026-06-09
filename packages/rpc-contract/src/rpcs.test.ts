import { describe, expect, test } from "bun:test";
import {
  AlarmRpcs,
  AuthRpcs,
  CredentialRpcs,
  DashboardRpcs,
  DeviceRpcs,
  InstallationRpcs,
  ShortcutRpcs,
} from "./index.ts";

const requestTags = (group: { readonly requests: ReadonlyMap<string, unknown> }) =>
  Array.from(group.requests.keys()).sort();

describe("dashboard RPC contract", () => {
  test("defines the expected dashboard RPC groups", () => {
    expect(requestTags(AuthRpcs)).toEqual(["Auth.GetSession", "Auth.Logout"]);
    expect(requestTags(CredentialRpcs)).toEqual([
      "Credential.CreateCredential",
      "Credential.DeleteCredential",
      "Credential.ListCredentials",
      "Credential.RequestCredentialMfa",
      "Credential.ValidateCredentialMfa",
    ]);
    expect(requestTags(InstallationRpcs)).toEqual([
      "Installation.ListInstallations",
      "Installation.SetDefaultInstallation",
    ]);
    expect(requestTags(AlarmRpcs)).toEqual([
      "Alarm.ArmAway",
      "Alarm.ArmHome",
      "Alarm.Disarm",
      "Alarm.GetArmState",
      "Alarm.SetAlarmMode",
      "Alarm.ToggleFullAlarm",
    ]);
    expect(requestTags(DeviceRpcs)).toEqual([
      "Device.ListClimate",
      "Device.ListDoorWindows",
      "Device.ListSmartLocks",
      "Device.ListSmartPlugs",
    ]);
    expect(requestTags(ShortcutRpcs)).toEqual([
      "Shortcut.ExportShortcut",
      "Shortcut.ListApiTokens",
      "Shortcut.RevokeApiToken",
    ]);
  });

  test("combines groups into a single dashboard contract", () => {
    expect(DashboardRpcs.requests.size).toBe(22);
    expect(DashboardRpcs.requests.has("Alarm.SetAlarmMode")).toBe(true);
    expect(DashboardRpcs.requests.has("Shortcut.ExportShortcut")).toBe(true);
  });

  test("requires dashboard auth middleware for every RPC", () => {
    for (const rpc of DashboardRpcs.requests.values()) {
      expect(rpc.middlewares.size).toBe(1);
    }
  });
});
