import { AlarmModes, type AlarmMode, type ShortcutAlarmMode } from "./dto.ts";

export const isAlarmMode = (value: string): value is AlarmMode =>
  (AlarmModes as ReadonlyArray<string>).includes(value);

export const isShortcutAlarmMode = (value: string): value is ShortcutAlarmMode =>
  value === "DISARMED" || value === "ARMED_AWAY";

export const alarmModeToVerisureMutation = (
  mode: AlarmMode,
): "disarm" | "armAway" | "armHome" => {
  switch (mode) {
    case "DISARMED":
      return "disarm";
    case "ARMED_AWAY":
      return "armAway";
    case "ARMED_HOME":
      return "armHome";
  }
};

export const nextFullAlarmMode = (current: AlarmMode): ShortcutAlarmMode =>
  current === "ARMED_AWAY" ? "DISARMED" : "ARMED_AWAY";
