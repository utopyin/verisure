import * as Cloudflare from "alchemy/Cloudflare";

export class Web extends Cloudflare.Vite<Web>()("Web", {
  rootDir: "./apps/web",
  compatibility: {
    flags: ["nodejs_compat"],
  },
  assets: {
    runWorkerFirst: true,
  },
  env: {
    VITE_API_BASE_URL: "/api",
  },
}) {}

export default Web;
