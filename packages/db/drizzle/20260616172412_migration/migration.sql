CREATE TABLE `account` (
	`accessToken` text,
	`accessTokenExpiresAt` integer,
	`accountId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`id` text PRIMARY KEY,
	`idToken` text,
	`password` text,
	`providerId` text NOT NULL,
	`refreshToken` text,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`updatedAt` integer NOT NULL,
	`userId` text NOT NULL,
	CONSTRAINT `fk_account_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `api_token` (
	`allowed_giids_json` text,
	`created_at` integer NOT NULL,
	`credential_id` text NOT NULL,
	`display_prefix` text NOT NULL,
	`expires_at` integer,
	`id` text PRIMARY KEY,
	`last_used_at` integer,
	`revoked_at` integer,
	`scopes_json` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_api_token_credential_id_verisure_credential_id_fk` FOREIGN KEY (`credential_id`) REFERENCES `verisure_credential`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_api_token_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`id` text PRIMARY KEY,
	`ipAddress` text,
	`token` text NOT NULL UNIQUE,
	`updatedAt` integer NOT NULL,
	`userAgent` text,
	`userId` text NOT NULL,
	CONSTRAINT `fk_session_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `shortcut_export` (
	`api_token_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`credential_id` text NOT NULL,
	`download_nonce_hash` text,
	`id` text PRIMARY KEY,
	`template` text NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_shortcut_export_api_token_id_api_token_id_fk` FOREIGN KEY (`api_token_id`) REFERENCES `api_token`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_shortcut_export_credential_id_verisure_credential_id_fk` FOREIGN KEY (`credential_id`) REFERENCES `verisure_credential`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_shortcut_export_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`createdAt` integer NOT NULL,
	`email` text NOT NULL UNIQUE,
	`emailVerified` integer NOT NULL,
	`id` text PRIMARY KEY,
	`image` text,
	`name` text NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`updatedAt` integer NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verisure_credential` (
	`alias` text NOT NULL,
	`connected_at` integer,
	`connection_status` text NOT NULL,
	`connection_status_message` text,
	`created_at` integer NOT NULL,
	`default_giid` text,
	`encrypted_email` text NOT NULL,
	`encrypted_password` text NOT NULL,
	`encrypted_pin` text,
	`id` text PRIMARY KEY,
	`last_connection_attempt_at` integer,
	`mfa_requested_at` integer,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_verisure_credential_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
