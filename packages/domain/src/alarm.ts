import { AlarmModes } from "./dto.ts";
import type { AlarmMode, ShortcutAlarmMode } from "./dto.ts";

export const isAlarmMode = (value: string): value is AlarmMode =>
  (AlarmModes as readonly string[]).includes(value);

export const isShortcutAlarmMode = (
  value: string
): value is ShortcutAlarmMode => value === "DISARMED" || value === "ARMED_AWAY";

export const nextFullAlarmMode = (current: AlarmMode): ShortcutAlarmMode =>
  current === "ARMED_AWAY" ? "DISARMED" : "ARMED_AWAY";
