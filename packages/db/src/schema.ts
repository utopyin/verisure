import { defineRelations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  id: text("id").primaryKey(),
  image: text("image"),
  name: text("name").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  ipAddress: text("ipAddress"),
  token: text("token").notNull().unique(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  accessToken: text("accessToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", {
    mode: "timestamp_ms",
  }),
  accountId: text("accountId").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  idToken: text("idToken"),
  password: text("password"),
  providerId: text("providerId").notNull(),
  refreshToken: text("refreshToken"),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const verification = sqliteTable("verification", {
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  value: text("value").notNull(),
});

export const verisureCredential = sqliteTable("verisure_credential", {
  alias: text("alias").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp_ms" }),
  connectionStatus: text("connection_status", {
    enum: [
      "unchecked",
      "connected",
      "mfa_required",
      "auth_failed",
      "rate_limited",
      "error",
    ],
  }).notNull(),
  connectionStatusMessage: text("connection_status_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  defaultGiid: text("default_giid"),
  encryptedEmail: text("encrypted_email").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  encryptedPin: text("encrypted_pin"),
  id: text("id").primaryKey(),
  lastConnectionAttemptAt: integer("last_connection_attempt_at", {
    mode: "timestamp_ms",
  }),
  mfaRequestedAt: integer("mfa_requested_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const apiToken = sqliteTable("api_token", {
  allowedGiidsJson: text("allowed_giids_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  credentialId: text("credential_id")
    .notNull()
    .references(() => verisureCredential.id, { onDelete: "cascade" }),
  displayPrefix: text("display_prefix").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  id: text("id").primaryKey(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  scopesJson: text("scopes_json").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const shortcutExport = sqliteTable("shortcut_export", {
  apiTokenId: text("api_token_id")
    .notNull()
    .references(() => apiToken.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  credentialId: text("credential_id")
    .notNull()
    .references(() => verisureCredential.id, { onDelete: "cascade" }),
  downloadNonceHash: text("download_nonce_hash"),
  id: text("id").primaryKey(),
  template: text("template", {
    enum: ["toggle-full", "choose-mode"],
  }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const tables = {
  account,
  apiToken,
  session,
  shortcutExport,
  user,
  verification,
  verisureCredential,
};

export const relations = defineRelations(tables);

export type Schema = typeof tables;
export type Relations = typeof relations;
export type UserRow = typeof user.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type AccountRow = typeof account.$inferSelect;
export type VerificationRow = typeof verification.$inferSelect;
export type VerisureCredentialRow = typeof verisureCredential.$inferSelect;
export type ApiTokenRow = typeof apiToken.$inferSelect;
export type ShortcutExportRow = typeof shortcutExport.$inferSelect;

export type UserInsert = typeof user.$inferInsert;
export type SessionInsert = typeof session.$inferInsert;
export type AccountInsert = typeof account.$inferInsert;
export type VerificationInsert = typeof verification.$inferInsert;
export type VerisureCredentialInsert = typeof verisureCredential.$inferInsert;
export type ApiTokenInsert = typeof apiToken.$inferInsert;
export type ShortcutExportInsert = typeof shortcutExport.$inferInsert;
