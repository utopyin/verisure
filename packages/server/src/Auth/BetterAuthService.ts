import { D1Database } from "@verisure/db/cloudflare";
import type { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { EmailLive } from "../Email";
import { EmailService } from "../Email/EmailService";
import { RuntimeConfig } from "../Runtime/RuntimeConfig";

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
}

export interface AuthSession {
  readonly expiresAt: Date;
  readonly user: AuthUser;
}

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface BetterAuthInstance {
  readonly handler: (request: Request) => Promise<Response>;
  readonly api: {
    readonly getSession: (context: {
      readonly headers: Headers;
    }) => Promise<unknown>;
  };
}

export interface BetterAuthServiceShape {
  readonly auth: Effect.Effect<BetterAuthInstance, AuthError, RuntimeContext>;
  readonly fetch: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    AuthError,
    HttpServerRequest | RuntimeContext
  >;
  readonly getSession: (
    request: Request | Headers
  ) => Effect.Effect<Option.Option<AuthSession>, AuthError, RuntimeContext>;
}

/**
 * Better Auth operations are runtime-only because they use Alchemy runtime
 * bindings such as D1 and Email under the hood.
 *
 * @effect-expect-leaking RuntimeContext
 */
export class BetterAuthService extends Context.Service<
  BetterAuthService,
  BetterAuthServiceShape
>()("@verisure/server/BetterAuthService") {
  static readonly Test = (
    options: {
      readonly session?: Option.Option<AuthSession>;
    } = {}
  ) =>
    Layer.succeed(
      BetterAuthService,
      BetterAuthService.of({
        auth: Effect.die("auth instance not used in tests"),
        fetch: Effect.die("auth fetch not used in tests"),
        getSession: () => Effect.succeed(options.session ?? Option.none()),
      })
    );

  static readonly Live = Layer.effect(
    BetterAuthService,
    Effect.gen(function* () {
      const config = yield* RuntimeConfig;
      const email = yield* EmailService;
      const database = yield* D1Database;
      const connection = yield* Cloudflare.D1Connection.bind(database);

      const getBetterAuth = yield* Effect.gen(function* () {
        const d1 = yield* connection.raw;
        const runtimeContext = yield* Effect.context<RuntimeContext>();

        return betterAuth({
          baseURL: {
            allowedHosts: [
              "localhost",
              "localhost:*",
              "127.0.0.1",
              "127.0.0.1:*",
              "verisure.utopy.sh",
              "*.utopy.sh",
            ],
            fallback: config.appBaseUrl,
            protocol: "auto",
          },
          database: d1,
          plugins: [
            magicLink({
              sendMagicLink: ({ email: to, url }) =>
                Effect.runPromiseWith(runtimeContext)(
                  email.send(renderMagicLinkEmail({ to, url }))
                ),
              storeToken: "hashed",
            }),
          ],
          secret: Redacted.value(config.betterAuthSecret),
          trustedOrigins: (request) => {
            const origin = request?.headers.get("origin");
            return Promise.resolve(origin ? [origin] : []);
          },
        });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({ cause, message: "Failed to initialize auth" })
        ),
        Effect.cached
      );

      const getSession: BetterAuthServiceShape["getSession"] = Effect.fn(
        "BetterAuthService.getSession"
      )(function* (input) {
        const auth = yield* getBetterAuth;

        const session = yield* Effect.tryPromise({
          catch: (cause) =>
            new AuthError({ cause, message: "Failed to read session" }),
          try: () =>
            auth.api.getSession({
              headers: input instanceof Headers ? input : input.headers,
            }),
        });

        return yield* decodeAuthSession(session);
      });

      const fetch: BetterAuthServiceShape["fetch"] = Effect.gen(
        function* fetch() {
          const request = yield* HttpServerRequest;

          if (request.method === "OPTIONS") {
            return HttpServerResponse.fromWeb(
              new Response(null, {
                headers: corsHeaders(request),
                status: 204,
              })
            );
          }

          const auth = yield* getBetterAuth;
          const response = yield* Effect.tryPromise({
            catch: (cause) =>
              new AuthError({ cause, message: "Auth request failed" }),
            try: () => auth.handler(request.source as Request),
          });

          return HttpServerResponse.fromWeb(addCorsHeaders(request, response));
        }
      );

      return BetterAuthService.of({ auth: getBetterAuth, fetch, getSession });
    })
  ).pipe(Layer.provide(EmailLive));
}

const renderMagicLinkEmail = (input: {
  readonly to: string;
  readonly url: string;
}) => ({
  html: renderMagicLinkHtml(input.url),
  subject: "Sign in to Verisure",
  text: `Open this link to sign in to Verisure: ${input.url}\n\nIf you did not request this email, you can ignore it.`,
  to: input.to,
});

const renderMagicLinkHtml = (url: string) => `<!doctype html>
<html>
  <body>
    <p>Open this link to sign in to Verisure:</p>
    <p><a href="${escapeHtml(url)}">Sign in</a></p>
    <p>If you did not request this email, you can ignore it.</p>
  </body>
</html>`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const decodeAuthSession = (
  value: unknown
): Effect.Effect<Option.Option<AuthSession>, AuthError> =>
  Effect.gen(function* () {
    const session = yield* decodeAuthSessionResponse(value).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            cause,
            message: "Auth session response was invalid",
          })
      )
    );

    if (session === null || session === undefined) {
      return Option.none<AuthSession>();
    }

    if (Number.isNaN(session.session.expiresAt.getTime())) {
      return yield* new AuthError({
        message: "Auth session expiry was invalid",
      });
    }

    return Option.some({
      expiresAt: session.session.expiresAt,
      user: {
        email: session.user.email,
        id: session.user.id,
        ...(session.user.name === null || session.user.name === undefined
          ? {}
          : { name: session.user.name }),
      },
    });
  });

const AuthSessionResponse = Schema.NullishOr(
  Schema.Struct({
    session: Schema.Struct({
      expiresAt: Schema.Union([Schema.Date, Schema.DateFromString]),
    }),
    user: Schema.Struct({
      email: Schema.String,
      id: Schema.String,
      name: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  })
);
const decodeAuthSessionResponse =
  Schema.decodeUnknownEffect(AuthSessionResponse);

const corsHeaders = (request: HttpServerRequest) => {
  const headers = new Headers();
  const { origin } = request.headers;
  if (origin) {
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set(
    "Access-Control-Allow-Headers",
    request.headers["access-control-request-headers"] ??
      "Content-Type, Authorization"
  );
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  return headers;
};

const addCorsHeaders = (request: HttpServerRequest, response: Response) => {
  const { origin } = request.headers;
  if (!origin) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
