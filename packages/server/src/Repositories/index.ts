import * as Layer from "effect/Layer";

import { ApiTokenRepository } from "./ApiTokenRepository";
import { CredentialRepository } from "./CredentialRepository";
import { ShortcutExportRepository } from "./ShortcutExportRepository";

export * from "./ApiTokenRepository";
export * from "./CredentialRepository";
export * from "./RepositoryError";
export * from "./ShortcutExportRepository";

export const RepositoryLive = Layer.mergeAll(
  ApiTokenRepository.Default,
  CredentialRepository.Default,
  ShortcutExportRepository.Default
);
