import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { AlarmRpcs } from "./alarm";
import { AuthRpcs } from "./auth";
import { CredentialRpcs } from "./credential";
import { DeviceRpcs } from "./device";
import { InstallationRpcs } from "./installation";
import { ShortcutRpcs } from "./shortcut";

export { AlarmRpcs } from "./alarm";
export { AuthRpcs } from "./auth";
export { CredentialRpcs } from "./credential";
export { DeviceRpcs } from "./device";
export { InstallationRpcs } from "./installation";
export {
  ShortcutApiTokenSummary,
  ShortcutExportPayload,
  ShortcutRpcs,
} from "./shortcut";

export const DashboardRpcs = AuthRpcs.merge(
  CredentialRpcs,
  InstallationRpcs,
  AlarmRpcs,
  DeviceRpcs,
  ShortcutRpcs
);

export type DashboardRpcs = RpcGroup.Rpcs<typeof DashboardRpcs>;
