import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

export interface RuntimeConfigShape {
  readonly appBaseUrl: string;
  readonly betterAuthSecret: Redacted.Redacted;
  readonly credentialEncryptionKey: Redacted.Redacted;
  readonly emailFrom: string;
  readonly tokenPepper: Option.Option<Redacted.Redacted>;
}

export class RuntimeConfig extends Context.Service<
  RuntimeConfig,
  RuntimeConfigShape
>()("@verisure/server/RuntimeConfig") {
  static readonly Live = Layer.effect(
    RuntimeConfig,
    Effect.gen(function* makeRuntimeConfig() {
      const appBaseUrl = yield* Config.string("APP_BASE_URL").pipe(
        Config.withDefault("https://verisure.utopy.sh")
      );
      const betterAuthSecret = Redacted.make(
        yield* Config.string("BETTER_AUTH_SECRET")
      );
      const credentialEncryptionKey = Redacted.make(
        yield* Config.string("CREDENTIAL_ENCRYPTION_KEY")
      );
      const emailFrom = yield* Config.string("CLOUDFLARE_EMAIL_FROM").pipe(
        Config.withDefault("Matteo Scotto <automations@verisure.utopy.sh>")
      );
      const tokenPepper = yield* Config.string("TOKEN_PEPPER").pipe(
        Config.option,
        Effect.map(Option.map(Redacted.make))
      );

      return RuntimeConfig.of({
        appBaseUrl,
        betterAuthSecret,
        credentialEncryptionKey,
        emailFrom,
        tokenPepper,
      });
    })
  );
}
