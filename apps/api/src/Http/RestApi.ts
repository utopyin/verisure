import * as Domain from "@verisure/domain";
import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import type { HttpServerRequest as HttpServerRequestShape } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import {
  applicationErrorToHttpServerResponse,
  toHttpServerResponse,
} from "./ErrorMapper";

export const ShortcutRestMount = "/api/v1/*" as const;

const GiidQuery = Schema.Struct({ giid: Schema.NonEmptyString });
const ToggleFullBody = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  giid: Schema.NonEmptyString,
});
const ToggleFullRequest = Schema.Struct({ body: ToggleFullBody });
const SetModeBody = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  giid: Schema.NonEmptyString,
  mode: Domain.AlarmModeSchema,
});
const SetModeRequest = Schema.Struct({ body: SetModeBody });

export const ShortcutRestRoutes = HttpRouter.use((router) => {
  const api = router.prefixed("/api/v1");

  return Effect.gen(function* () {
    yield* api.add(
      "GET",
      "/alarm/status",
      HttpRouter.schemaParams(GiidQuery).pipe(
        Effect.mapError(
          (cause) =>
            new RpcContract.InvalidInput({
              message:
                cause instanceof Error
                  ? cause.message
                  : "Invalid request payload",
            })
        ),
        Effect.matchEffect({
          onFailure: toHttpServerResponse,
          onSuccess: (query) =>
            Server.AlarmService.pipe(
              Effect.flatMap((alarm) => alarm.getArmState),
              Effect.flatMap((body) => HttpServerResponse.json(body)),
              shortcutContextMiddleware({
                giid: query.giid,
                requiredScopes: [Server.ShortcutAlarmReadScope],
              })
            ),
        })
      )
    );

    yield* api.add(
      "POST",
      "/alarm/toggle-full",
      HttpRouter.schemaJson(ToggleFullRequest).pipe(
        Effect.mapError(
          (cause) =>
            new RpcContract.InvalidInput({
              message:
                cause instanceof Error
                  ? cause.message
                  : "Invalid request payload",
            })
        ),
        Effect.matchEffect({
          onFailure: toHttpServerResponse,
          onSuccess: ({ body }) =>
            Server.AlarmService.pipe(
              Effect.flatMap((alarm) => alarm.toggleFull(body.code)),
              Effect.flatMap((responseBody) =>
                HttpServerResponse.json(responseBody)
              ),
              shortcutContextMiddleware({
                giid: body.giid,
                requiredScopes: [Server.ShortcutAlarmWriteScope],
              })
            ),
        })
      )
    );

    yield* api.add(
      "POST",
      "/alarm/mode",
      HttpRouter.schemaJson(SetModeRequest).pipe(
        Effect.mapError(
          (cause) =>
            new RpcContract.InvalidInput({
              message:
                cause instanceof Error
                  ? cause.message
                  : "Invalid request payload",
            })
        ),
        Effect.matchEffect({
          onFailure: toHttpServerResponse,
          onSuccess: ({ body }) =>
            Server.AlarmService.pipe(
              Effect.flatMap((alarm) =>
                alarm.setMode({ code: body.code, mode: body.mode })
              ),
              Effect.flatMap((responseBody) =>
                HttpServerResponse.json(responseBody)
              ),
              shortcutContextMiddleware({
                giid: body.giid,
                requiredScopes: [Server.ShortcutAlarmWriteScope],
              })
            ),
        })
      )
    );
  });
});

const ShortcutRestLive = ShortcutRestRoutes.pipe(
  Layer.provideMerge(HttpRouter.layer)
);

export const ShortcutRestHttp = HttpRouter.HttpRouter.pipe(
  Effect.map((router) =>
    router.asHttpEffect().pipe(
      Effect.matchEffect({
        onFailure: () =>
          HttpServerResponse.json(
            { error: { code: "not_found", message: "Not Found" } },
            { status: 404 }
          ),
        onSuccess: (response) => Effect.succeed(response),
      })
    )
  ),
  Effect.provide(ShortcutRestLive)
);

const shortcutContextMiddleware = (input: {
  readonly giid: string;
  readonly requiredScopes: readonly string[];
}) =>
  HttpMiddleware.make((handler) =>
    Effect.gen(function* () {
      const apiTokens = yield* Server.ApiTokenService;
      const crypto = yield* Server.CredentialCrypto;
      const requests = yield* Server.VerisureRequests;
      const request = yield* HttpServerRequest;
      const plaintextToken = yield* bearerToken(request);
      const authenticated = yield* apiTokens.authenticate({
        giid: input.giid,
        plaintextToken,
        requiredScopes: input.requiredScopes,
      });

      const decrypted = yield* crypto.decryptCredential(
        authenticated.credential
      );
      const installations = yield* requests
        .fetchAllInstallations({ email: Redacted.value(decrypted.email) })
        .pipe(
          Effect.provideService(
            Server.CurrentCredential,
            authenticated.credential
          )
        );

      if (
        !installations.some((installation) => installation.giid === input.giid)
      ) {
        return yield* new Server.ScopeError({
          credentialId: authenticated.credential.id,
          giid: input.giid,
          message: "Installation not found or not owned by current credential",
        });
      }

      return yield* handler.pipe(
        Effect.provideService(Server.CurrentUser, authenticated.user),
        Effect.provideService(
          Server.CurrentCredential,
          authenticated.credential
        ),
        Effect.provideService(Server.CurrentInstallation, {
          giid: input.giid,
        })
      );
    }).pipe(
      Effect.matchEffect({
        onFailure: (error) => {
          if (error instanceof Server.ApiTokenError) {
            if (
              error.message.includes("missing required scope") ||
              error.message.includes("not allowed to access this installation")
            ) {
              return toHttpServerResponse(
                new RpcContract.Forbidden({ message: error.message })
              );
            }

            return toHttpServerResponse(
              new RpcContract.Unauthorized({ message: error.message })
            );
          }

          return applicationErrorToHttpServerResponse(
            error as Parameters<typeof applicationErrorToHttpServerResponse>[0]
          );
        },
        onSuccess: (response) => Effect.succeed(response),
      })
    )
  );

const bearerToken = (
  request: HttpServerRequestShape
): Effect.Effect<string, Server.ApiTokenError> => {
  const { authorization } = request.headers;
  if (authorization === undefined) {
    return Effect.fail(
      new Server.ApiTokenError({ message: "Missing bearer token" })
    );
  }

  const match = /^Bearer\s+(?<token>.+)$/iu.exec(authorization);
  const token = match?.groups?.token;
  if (token === undefined || token.length === 0) {
    return Effect.fail(
      new Server.ApiTokenError({ message: "Invalid authorization header" })
    );
  }

  return Effect.succeed(token);
};
