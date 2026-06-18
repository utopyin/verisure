import { GraphQLError, RequestError, ResponseError } from "@verisure/domain";
import type { GraphQLOperation, VerisureDomainError } from "@verisure/domain";
import { serializeCookieHeader } from "@verisure/shared/cookies";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import type { CurrentCredential } from "../Security/RequestContext.ts";
import { VerisureAuth } from "./VerisureAuth.ts";
import type { VerisureAuthError } from "./VerisureAuth.ts";
import type { SessionCookie } from "./VerisureSessionStore.ts";
import { VerisureTransport } from "./VerisureTransport.ts";

export type VerisureGraphQLError = VerisureAuthError | VerisureDomainError;

export interface VerisureGraphQLShape {
  readonly execute: <A = unknown>(
    operations: readonly GraphQLOperation[]
  ) => Effect.Effect<A, VerisureGraphQLError, CurrentCredential>;
}

export class VerisureGraphQL extends Context.Service<
  VerisureGraphQL,
  VerisureGraphQLShape
>()("@verisure/server/VerisureGraphQL") {
  static readonly Live = Layer.effect(
    VerisureGraphQL,
    Effect.gen(function* makeVerisureGraphQL() {
      const auth = yield* VerisureAuth;
      const transport = yield* VerisureTransport;

      const execute = <A = unknown>(
        operations: readonly GraphQLOperation[]
      ): Effect.Effect<A, VerisureGraphQLError, CurrentCredential> =>
        Effect.gen(function* () {
          if (operations.length === 0) {
            return {} as A;
          }

          const session = yield* auth.ensureSession;
          const response = yield* transport.request(
            HttpClientRequest.post("/graphql", {
              headers: {
                Accept: "application/json",
                ...cookieHeader(session.cookies),
              },
            }).pipe(HttpClientRequest.bodyJsonUnsafe(operations))
          );
          const body = yield* response.text.pipe(
            Effect.mapError(
              (cause) =>
                new RequestError({
                  cause,
                  message: "Failed to read Verisure GraphQL response body",
                })
            ),
            Effect.flatMap((text) =>
              Effect.try({
                catch: () =>
                  new ResponseError({
                    message: "Failed to parse Verisure GraphQL response",
                    statusCode: response.status,
                    text,
                  }),
                try: () => (text.length === 0 ? null : JSON.parse(text)),
              })
            )
          );

          const error = graphQLErrorFromBody(body, operations);
          if (error !== undefined) {
            return yield* error;
          }

          return body as A;
        });

      return VerisureGraphQL.of({ execute });
    })
  );
}

const cookieHeader = (cookies: readonly SessionCookie[]) =>
  cookies.length === 0 ? {} : { Cookie: serializeCookieHeader(cookies) };

const graphQLErrorFromBody = (
  body: unknown,
  operations: readonly GraphQLOperation[]
): GraphQLError | undefined => {
  if (hasErrors(body)) {
    return new GraphQLError({
      errors: body.errors,
      message: "Verisure GraphQL response contained errors",
      operationName: operations[0]?.operationName,
    });
  }

  if (Array.isArray(body)) {
    const index = body.findIndex(hasErrors);
    if (index !== -1) {
      return new GraphQLError({
        errors: body[index]?.errors,
        message: "Verisure GraphQL response contained errors",
        operationName: operations[index]?.operationName,
      });
    }
  }

  return undefined;
};

const hasErrors = (value: unknown): value is { readonly errors: unknown } =>
  typeof value === "object" && value !== null && "errors" in value;
