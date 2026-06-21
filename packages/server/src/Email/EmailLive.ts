import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { CloudflareEmailLive } from "./CloudflareEmailLive";
import { ConsoleEmailLive } from "./ConsoleEmailLive";

export const EmailLive = Layer.unwrap(
  Effect.gen(function* () {
    const emailDriver = yield* Config.string("VERISURE_EMAIL_DRIVER").pipe(
      Config.withDefault("console")
    );

    return emailDriver === "cloudflare"
      ? CloudflareEmailLive
      : ConsoleEmailLive;
  })
);
