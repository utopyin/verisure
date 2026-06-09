export const ApiMounts = {
  auth: "/api/auth/*",
  health: "/api/health",
  rest: "/api/v1/*",
  rpc: "/api/rpc/*",
} as const;

export const routePlaceholder = (name: string) =>
  Response.json({ route: name, status: "not-implemented" }, { status: 501 });
