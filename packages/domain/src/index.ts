export const DomainPackage = "@verisure/domain" as const;

export type AlarmMode = "DISARMED" | "ARMED_AWAY" | "ARMED_HOME";

export type ConnectionStatus =
  | "unchecked"
  | "connected"
  | "mfa_required"
  | "auth_failed"
  | "rate_limited"
  | "error";
