import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { AlarmRpcs } from "./rpcs/alarm";
import { AuthRpcs } from "./rpcs/auth";
import { CredentialRpcs } from "./rpcs/credential";
import { DeviceRpcs } from "./rpcs/device";
import { InstallationRpcs } from "./rpcs/installation";
import { ShortcutRpcs } from "./rpcs/shortcut";

export { AlarmRpcs } from "./rpcs/alarm";
export { AuthRpcs } from "./rpcs/auth";
export { CredentialRpcs } from "./rpcs/credential";
export { DeviceRpcs } from "./rpcs/device";
export { InstallationRpcs } from "./rpcs/installation";
export {
  ShortcutApiTokenSummary,
  ShortcutExportPayload,
  ShortcutRpcs,
} from "./rpcs/shortcut";

export const DashboardRpcs = AuthRpcs.merge(
  CredentialRpcs,
  InstallationRpcs,
  AlarmRpcs,
  DeviceRpcs,
  ShortcutRpcs
);

export type DashboardRpcs = RpcGroup.Rpcs<typeof DashboardRpcs>;
