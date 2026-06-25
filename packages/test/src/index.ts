import type { UserRow, VerisureCredentialRow } from "@verisure/db/schema";
import type { CredentialSummary, InstallationSummary } from "@verisure/domain";
import type { ApiTokenRecord } from "@verisure/interface";
import { RuntimeContext } from "alchemy";
import type { BaseRuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export const testNow = new Date("2026-01-01T00:00:00.000Z");

export const testUser = {
  email: "user@example.com",
  id: "user-1",
  name: "User One",
};

export const testUserRow = {
  createdAt: testNow,
  email: testUser.email,
  emailVerified: true,
  id: testUser.id,
  image: null,
  name: testUser.name,
  updatedAt: testNow,
} satisfies UserRow;

export const testAuthSession = {
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  user: testUser,
};

export const testCredentialRow = {
  alias: "Home",
  connectedAt: null,
  connectionStatus: "connected",
  connectionStatusMessage: null,
  createdAt: testNow,
  defaultGiid: "giid-1",
  encryptedEmail: "encrypted-email",
  encryptedPassword: "encrypted-password",
  encryptedPin: null,
  id: "cred-1",
  lastConnectionAttemptAt: null,
  mfaRequestedAt: null,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  userId: testUser.id,
} satisfies VerisureCredentialRow;

export const testCredentialSummary = {
  alias: testCredentialRow.alias,
  connectionStatus: testCredentialRow.connectionStatus,
  createdAt: testCredentialRow.createdAt.toISOString(),
  defaultGiid: testCredentialRow.defaultGiid,
  email: testUser.email,
  id: testCredentialRow.id,
  updatedAt: testCredentialRow.updatedAt.toISOString(),
} satisfies CredentialSummary;

export const testInstallation = {
  alias: "Home",
  giid: "giid-1",
} satisfies InstallationSummary;

export const testApiToken = {
  allowedGiids: [testInstallation.giid],
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  credentialId: testCredentialRow.id,
  displayPrefix: "vs_abc123…",
  expiresAt: null,
  id: "token-1",
  lastUsedAt: null,
  revokedAt: null,
  scopes: ["shortcut:alarm:read"],
  tokenHash: "hash",
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
  userId: testUser.id,
} satisfies ApiTokenRecord;

export const RuntimeContextTestLayer = Layer.succeed(RuntimeContext, {
  Type: "TestRuntime",
  env: {},
  get: <T>() => Effect.succeed(undefined as T | undefined),
  id: "test-runtime",
  set: (id: string) => Effect.succeed(id),
} satisfies BaseRuntimeContext);
