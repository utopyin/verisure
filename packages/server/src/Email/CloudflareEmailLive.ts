import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { RuntimeConfig } from "../Runtime/RuntimeConfig.ts";
import { EmailError, EmailService } from "./EmailService.ts";
import type { EmailServiceShape } from "./EmailService.ts";

export const Email = Cloudflare.SendEmail("Email");

export const CloudflareEmailLive = Layer.effect(
  EmailService,
  Effect.gen(function* makeCloudflareEmail() {
    const config = yield* RuntimeConfig;
    const sender = yield* Email;
    const client = yield* Cloudflare.SendEmail.bind(sender);

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
).pipe(Layer.provide(Cloudflare.SendEmailBindingLive));
