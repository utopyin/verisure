import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

export type VerisureBaseUrls = readonly [string, ...string[]];

export interface RuntimeConfigShape {
  readonly appBaseUrl: string;
  readonly betterAuthSecret: Redacted.Redacted;
  readonly credentialEncryptionKey: Redacted.Redacted;
  readonly emailFrom: string;
  readonly tokenPepper: Option.Option<Redacted.Redacted>;
  readonly verisureApplicationId: Option.Option<string>;
  readonly verisureBaseUrls: Option.Option<VerisureBaseUrls>;
}

const CommaSeparatedVerisureBaseUrls = Schema.String.pipe(
  Schema.decodeTo(
    Schema.NonEmptyArray(
      Schema.NonEmptyString.check(
        Schema.isPattern(/^https:\/\/[^,\s]+$/u, {
          message: "Expected an HTTPS Verisure base URL",
        })
      )
    ),
    SchemaTransformation.transform({
      decode: (value) =>
        value
          .split(",")
          .map((baseUrl) => baseUrl.trim())
          .filter(
            (baseUrl) => baseUrl.length > 0
          ) as unknown as VerisureBaseUrls,
      encode: (baseUrls) => baseUrls.join(","),
    })
  )
);

export class RuntimeConfig extends Context.Service<
  RuntimeConfig,
  RuntimeConfigShape
>()("@verisure/server/RuntimeConfig") {
  static readonly Live = Layer.effect(
    RuntimeConfig,
    Effect.gen(function* () {
      const appBaseUrl = yield* Config.string("APP_BASE_URL").pipe(
        Config.withDefault("https://verisure.utopy.sh")
      );
      const betterAuthSecret = yield* Config.redacted("BETTER_AUTH_SECRET");
      const credentialEncryptionKey = yield* Config.redacted(
        "CREDENTIAL_ENCRYPTION_KEY"
      );
      const emailFrom = yield* Config.string("CLOUDFLARE_EMAIL_FROM").pipe(
        Config.withDefault("Matteo Scotto <automations@verisure.utopy.sh>")
      );
      const tokenPepper = yield* Config.redacted("TOKEN_PEPPER").pipe(
        Config.option
      );
      const verisureApplicationId = yield* Config.string(
        "VERISURE_APPLICATION_ID"
      ).pipe(Config.option);
      const verisureBaseUrls = yield* Config.schema(
        CommaSeparatedVerisureBaseUrls,
        "VERISURE_BASE_URLS"
      ).pipe(Config.option);

      return RuntimeConfig.of({
        appBaseUrl,
        betterAuthSecret,
        credentialEncryptionKey,
        emailFrom,
        tokenPepper,
        verisureApplicationId,
        verisureBaseUrls,
      });
    })
  );
}
