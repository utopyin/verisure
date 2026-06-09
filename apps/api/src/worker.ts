import { ApiMounts, routePlaceholder } from "./Http/App.ts";

export { VerisureSessionObject } from "./SessionObject.ts";

export interface ApiEnv {
  readonly DB: D1Database;
  readonly EMAIL: unknown;
  readonly VERISURE_SESSIONS: DurableObjectNamespace;
  readonly VERISURE_CACHE: KVNamespace;
  readonly VERISURE_RATE_LIMIT: unknown;
  readonly BETTER_AUTH_SECRET: string;
  readonly CREDENTIAL_ENCRYPTION_KEY: string;
  readonly TOKEN_PEPPER?: string;
}

const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    headers: { "content-type": "application/json" },
    ...init,
  });

export default {
  async fetch(request: Request, _env: ApiEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === ApiMounts.health) {
      return json({ ok: true, service: "verisure-api" });
    }

    if (url.pathname.startsWith("/api/auth/")) {
      return routePlaceholder("better-auth");
    }

    if (url.pathname.startsWith("/api/rpc")) {
      return routePlaceholder("dashboard-rpc");
    }

    if (url.pathname.startsWith("/api/v1/")) {
      return routePlaceholder("shortcut-rest");
    }

    return json({ error: "Not Found" }, { status: 404 });
  },
};
