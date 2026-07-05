import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { alarmHandlers } from "./AlarmHandlers";
import * as Alarm from "./AlarmHandlers";
import { authHandlers } from "./AuthHandlers";
import * as Auth from "./AuthHandlers";
import { AuthMiddlewareLive } from "./AuthMiddleware";
import { credentialHandlers } from "./CredentialHandlers";
import * as Credential from "./CredentialHandlers";
import { deviceHandlers } from "./DeviceHandlers";
import * as Device from "./DeviceHandlers";
import { installationHandlers } from "./InstallationHandlers";
import * as Installation from "./InstallationHandlers";
import {
  CredentialScopeMiddlewareLive,
  InstallationScopeMiddlewareLive,
} from "./ScopeMiddleware";
import { shortcutHandlers } from "./ShortcutHandlers";
import * as Shortcut from "./ShortcutHandlers";

export const Rpcs = Auth.Rpcs.merge(
  Credential.Rpcs,
  Installation.Rpcs,
  Alarm.Rpcs,
  Device.Rpcs,
  Shortcut.Rpcs
);

export const HandlersLive = Rpcs.toLayer(
  Effect.gen(function* () {
    const alarm = yield* alarmHandlers;
    const auth = yield* authHandlers;
    const credential = yield* credentialHandlers;
    const device = yield* deviceHandlers;
    const installation = yield* installationHandlers;
    const shortcut = yield* shortcutHandlers;

    return Rpcs.of({
      ...alarm,
      ...auth,
      ...credential,
      ...device,
      ...installation,
      ...shortcut,
    });
  })
).pipe(
  Layer.provideMerge(AuthMiddlewareLive),
  Layer.provideMerge(CredentialScopeMiddlewareLive),
  Layer.provideMerge(InstallationScopeMiddlewareLive)
);
