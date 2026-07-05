import * as Cloudflare from "alchemy/Cloudflare";

class Web extends Cloudflare.Website.Vite<Web>()("Web", {
  assets: {
    runWorkerFirst: true,
  },
  compatibility: {
    flags: ["nodejs_compat"],
  },
  env: {
    VITE_API_BASE_URL: "/api",
  },
  rootDir: "./apps/web",
}) {}

export default Web;
