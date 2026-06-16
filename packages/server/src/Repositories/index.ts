import * as Layer from "effect/Layer";

import { ApiTokenRepository } from "./ApiTokenRepository.ts";
import { CredentialRepository } from "./CredentialRepository.ts";
import { ShortcutExportRepository } from "./ShortcutExportRepository.ts";

export * from "./ApiTokenRepository.ts";
export * from "./CredentialRepository.ts";
export * from "./RepositoryError.ts";
export * from "./ShortcutExportRepository.ts";

export const RepositoryLive = Layer.mergeAll(
  ApiTokenRepository.Default,
  CredentialRepository.Default,
  ShortcutExportRepository.Default
);
