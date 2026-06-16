export * from "./Auth.ts";
export * from "./Email/index.ts";
export * from "./Repositories/index.ts";
export * from "./Runtime/index.ts";
export * from "./Security/index.ts";

export const ServerPackage = "@verisure/server" as const;

export const RequiredConfigKeys = [
  "BETTER_AUTH_SECRET",
  "CREDENTIAL_ENCRYPTION_KEY",
  "TOKEN_PEPPER",
] as const;
