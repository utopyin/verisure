import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { HttpServerRequest as HttpServerRequestShape } from "effect/unstable/http/HttpServerRequest";
import type { HttpServerResponse } from "effect/unstable/http/HttpServerResponse";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { ShortcutApi } from "./ShortcutApi";
import { applicationErrorToShortcutHttpServerResponse } from "./ShortcutErrors";
import type { ShortcutApplicationError } from "./ShortcutErrors";

export const ShortcutApiHandlers = HttpApiBuilder.group(
  ShortcutApi,
  "alarm",
  Effect.fn("ShortcutApi.handlers")(function* (handlers) {
    const alarm = yield* Server.AlarmService;

    return handlers
      .handle("status", ({ query, request }) =>
        withShortcutContext(
          {
            giid: query.giid,
            request,
            requiredScopes: [Server.ShortcutAlarmReadScope],
          },
          alarm.getArmState
        )
      )
      .handle("toggleFull", ({ payload, request }) =>
        withShortcutContext(
          {
            giid: payload.giid,
            request,
            requiredScopes: [Server.ShortcutAlarmWriteScope],
          },
          alarm.toggleFull(payload.code)
        )
      )
      .handle("setMode", ({ payload, request }) =>
        withShortcutContext(
          {
            giid: payload.giid,
            request,
            requiredScopes: [Server.ShortcutAlarmWriteScope],
          },
          alarm.setMode({ code: payload.code, mode: payload.mode })
        )
      );
  })
);

const withShortcutContext = <A, R>(
  input: {
    readonly giid: string;
    readonly request: HttpServerRequestShape;
    readonly requiredScopes: readonly string[];
  },
  effect: Effect.Effect<A, ShortcutApplicationError, R>
): Effect.Effect<A | HttpServerResponse, never, Exclude<R, ShortcutContext>> =>
  Effect.gen(function* () {
    const apiTokens = yield* Server.ApiTokenService;
    const crypto = yield* Server.CredentialCrypto;
    const requests = yield* Server.VerisureRequests;
    const plaintextToken = yield* bearerToken(input.request);
    const authenticated = yield* apiTokens.authenticate({
      giid: input.giid,
      plaintextToken,
      requiredScopes: input.requiredScopes,
    });

    const decrypted = yield* crypto.decryptCredential(authenticated.credential);
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

    return yield* effect.pipe(
      Effect.provideService(Server.CurrentUser, authenticated.user),
      Effect.provideService(Server.CurrentCredential, authenticated.credential),
      Effect.provideService(Server.CurrentInstallation, { giid: input.giid })
    );
  }).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        applicationErrorToShortcutHttpServerResponse(
          error as ShortcutApplicationError
        ),
      onSuccess: (response) => Effect.succeed(response),
    })
  ) as Effect.Effect<
    A | HttpServerResponse,
    never,
    Exclude<R, ShortcutContext>
  >;

type ShortcutContext =
  | Server.CurrentUser
  | Server.CurrentCredential
  | Server.CurrentInstallation;

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
