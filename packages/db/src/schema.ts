import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", {
    mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verisureCredential = sqliteTable("verisure_credential", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  encryptedEmail: text("encrypted_email").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  encryptedPin: text("encrypted_pin"),
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
  defaultGiid: text("default_giid"),
  lastConnectionAttemptAt: integer("last_connection_attempt_at", {
    mode: "timestamp_ms",
  }),
  connectedAt: integer("connected_at", { mode: "timestamp_ms" }),
  mfaRequestedAt: integer("mfa_requested_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const apiToken = sqliteTable("api_token", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialId: text("credential_id")
    .notNull()
    .references(() => verisureCredential.id, { onDelete: "cascade" }),
  displayPrefix: text("display_prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopesJson: text("scopes_json").notNull(),
  allowedGiidsJson: text("allowed_giids_json"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const shortcutExport = sqliteTable("shortcut_export", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialId: text("credential_id")
    .notNull()
    .references(() => verisureCredential.id, { onDelete: "cascade" }),
  apiTokenId: text("api_token_id")
    .notNull()
    .references(() => apiToken.id, { onDelete: "cascade" }),
  template: text("template", { enum: ["toggle-full", "choose-mode"] }).notNull(),
  downloadNonceHash: text("download_nonce_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const tables = {
  account,
  apiToken,
  session,
  shortcutExport,
  user,
  verisureCredential,
  verification,
};

export type Schema = typeof tables;
export type UserRow = typeof user.$inferSelect;
export type VerisureCredentialRow = typeof verisureCredential.$inferSelect;
export type ApiTokenRow = typeof apiToken.$inferSelect;
export type ShortcutExportRow = typeof shortcutExport.$inferSelect;
