export const ServerPackage = "@verisure/server" as const;

export const RequiredConfigKeys = [
  "BETTER_AUTH_SECRET",
  "CREDENTIAL_ENCRYPTION_KEY",
  "TOKEN_PEPPER",
] as const;
