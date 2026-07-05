import { layer as BrowserCryptoLayer } from "@effect/platform-browser/BrowserCrypto";
import * as Server from "@verisure/server";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Layer from "effect/Layer";

import { VerisureSessionObjectLive } from "../SessionObject";

export const InfrastructureLayer = Layer.mergeAll(
  Cloudflare.KVNamespaceBindingLive,
  Cloudflare.RateLimitBindingLive,
  Cloudflare.D1ConnectionLive,
  VerisureSessionObjectLive,
  Server.RuntimeConfig.Live,
  BrowserCryptoLayer
);
