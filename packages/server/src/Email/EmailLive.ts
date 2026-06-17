import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { CloudflareEmailLive } from "./CloudflareEmailLive.ts";
import { ConsoleEmailLive } from "./ConsoleEmailLive.ts";

export const EmailLive = Layer.unwrap(
  Effect.gen(function* makeAuthSupportLive() {
    const emailDriver = yield* Config.string("VERISURE_EMAIL_DRIVER").pipe(
      Config.withDefault("console")
    );

    return emailDriver === "cloudflare"
      ? CloudflareEmailLive
      : ConsoleEmailLive;
  })
);
