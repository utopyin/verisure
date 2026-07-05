import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import { EmailError, EmailService } from "./EmailService";
import type { EmailServiceShape } from "./EmailService";

export const Email = Cloudflare.Email.SendEmail("Email");

export const CloudflareEmailNoDeps = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const config = yield* RuntimeConfig;
    const sender = yield* Email;
    const client = yield* Cloudflare.Email.Send(sender);

    const send: EmailServiceShape["send"] = Effect.fn("EmailService.send")(
      (input) =>
        client
          .send({
            from: config.emailFrom,
            html: input.html,
            subject: input.subject,
            text: input.text,
            to: typeof input.to === "string" ? input.to : [...input.to],
          })
          .pipe(
            Effect.asVoid,
            Effect.mapError(
              (cause) =>
                new EmailError({
                  cause,
                  message: cause.message,
                })
            )
          )
    );

    return EmailService.of({ send });
  })
);

export const CloudflareEmailLive = CloudflareEmailNoDeps.pipe(
  Layer.provide(Cloudflare.Email.SendBinding)
);
