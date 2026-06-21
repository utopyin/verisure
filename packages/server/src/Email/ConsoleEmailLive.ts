import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { EmailService } from "./EmailService";
import type { EmailServiceShape } from "./EmailService";

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
