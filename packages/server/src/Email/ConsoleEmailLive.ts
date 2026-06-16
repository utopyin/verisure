import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { EmailService } from "./EmailService.ts";
import type { EmailServiceShape } from "./EmailService.ts";

export const ConsoleEmailLive = Layer.succeed(
  EmailService,
  EmailService.of({
    send: Effect.fn("EmailService.send.console")((input) =>
      Effect.logInfo("Dev email", {
        html: input.html,
        subject: input.subject,
        text: input.text,
        to: input.to,
      })
    ) satisfies EmailServiceShape["send"],
  })
);
