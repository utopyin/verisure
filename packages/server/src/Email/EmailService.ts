import type { RuntimeContext } from "alchemy";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

export interface SendEmailInput {
  readonly to: string | readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export class EmailError extends Schema.TaggedErrorClass<EmailError>()(
  "EmailError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}

export interface EmailServiceShape {
  readonly send: (
    input: SendEmailInput
  ) => Effect.Effect<void, EmailError, RuntimeContext>;
}

export class EmailService extends Context.Service<
  EmailService,
  EmailServiceShape
>()("@verisure/server/EmailService") {
  static readonly makeStub = (send: EmailServiceShape["send"]) =>
    Layer.succeed(EmailService, EmailService.of({ send }));
}
