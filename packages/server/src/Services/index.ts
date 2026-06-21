import * as Layer from "effect/Layer";

import { CredentialCrypto } from "../Security/CredentialCrypto";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import { AlarmService } from "./AlarmService";
import { CredentialService } from "./CredentialService";
import { DeviceService } from "./DeviceService";
import { InstallationService } from "./InstallationService";

export * from "./AlarmService";
export * from "./CredentialService";
export * from "./DeviceService";
export * from "./InstallationService";
export * from "./ServiceError";

export const ApplicationServicesLive = Layer.mergeAll(
  AlarmService.Live,
  CredentialService.Live,
  DeviceService.Live,
  InstallationService.Live
).pipe(
  Layer.provideMerge(VerisureRequests.Live),
  Layer.provideMerge(CredentialCrypto.Live.pipe(Layer.orDie))
);
