import * as Layer from "effect/Layer";

import { CredentialCrypto } from "../Security/CredentialCrypto";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import { AlarmService } from "./AlarmService";
import { ApiTokenService } from "./ApiTokenService";
import { CredentialService } from "./CredentialService";
import { DeviceService } from "./DeviceService";
import { InstallationService } from "./InstallationService";
import { ShortcutExportService } from "./ShortcutExportService";

export * from "./AlarmService";
export * from "./ApiTokenService";
export * from "./CredentialService";
export * from "./DeviceService";
export * from "./InstallationService";
export * from "./ServiceError";
export * from "./ShortcutExportService";

const BaseApplicationServicesLive = Layer.mergeAll(
  AlarmService.Live,
  ApiTokenService.Live,
  CredentialService.Live,
  DeviceService.Live,
  InstallationService.Live
);

export const ApplicationServicesLive = Layer.merge(
  BaseApplicationServicesLive,
  ShortcutExportService.Live.pipe(Layer.provideMerge(ApiTokenService.Live))
).pipe(
  Layer.provideMerge(VerisureRequests.Live),
  Layer.provideMerge(CredentialCrypto.Live.pipe(Layer.orDie))
);
