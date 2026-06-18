import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { DatabaseLive } from "@verisure/db/cloudflare";
import { BetterAuthService, EmailLive, RuntimeConfig } from "@verisure/server";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Layer from "effect/Layer";

export const ApiWorkerLive = Layer.mergeAll(
  BetterAuthService.Live.pipe(Layer.provide(EmailLive)),
  DatabaseLive.pipe(Layer.provide(Cloudflare.D1ConnectionLive)),
  Cloudflare.KVNamespaceBindingLive,
  Cloudflare.RateLimitBindingLive,
  BrowserCrypto.layer
).pipe(Layer.provide(RuntimeConfig.Live));
