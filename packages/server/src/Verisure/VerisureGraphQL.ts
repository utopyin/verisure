import {
  RequestError,
  ResponseError,
  classifyGraphQLResponse,
} from "@verisure/domain";
import type { GraphQLError, VerisureDomainError } from "@verisure/domain";
import type { GraphQLOperation } from "@verisure/graphql-client";
import { serializeCookieHeader } from "@verisure/shared/cookies";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import type { CurrentCredential } from "../Security/RequestContext.ts";
import { VerisureAuth } from "./VerisureAuth.ts";
import type { VerisureAuthError } from "./VerisureAuth.ts";
import type { SessionCookie } from "./VerisureSessionStore.ts";
import { VerisureTransport } from "./VerisureTransport.ts";

export type VerisureGraphQLError = VerisureAuthError | VerisureDomainError;

export interface VerisureGraphQLShape {
  readonly execute: <A, V>(
    operation: GraphQLOperation<A, V>
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

      const execute: VerisureGraphQLShape["execute"] = (operation) =>
        Effect.gen(function* () {
          const session = yield* auth.ensureSession;
          const response = yield* transport.request(
            HttpClientRequest.post("/graphql", {
              headers: {
                Accept: "application/json",
                ...cookieHeader(session.cookies),
              },
            }).pipe(HttpClientRequest.bodyJsonUnsafe([operation.request]))
          );
          const text = yield* response.text.pipe(
            Effect.mapError(
              (cause) =>
                new RequestError({
                  cause,
                  message: "Failed to read Verisure GraphQL response body",
                })
            )
          );
          const body = yield* Effect.try({
            catch: () =>
              new ResponseError({
                message: "Failed to parse Verisure GraphQL response",
                statusCode: response.status,
                text,
              }),
            try: () => (text.length === 0 ? null : JSON.parse(text)),
          });

          const error = graphQLErrorFromBody(body, operation.operationName);
          if (error !== undefined) {
            return yield* error;
          }

          return yield* operation.decode(body).pipe(
            Effect.mapError(
              (cause) =>
                new ResponseError({
                  message: "Failed to decode Verisure GraphQL response",
                  statusCode: response.status,
                  text: cause.message,
                })
            )
          );
        });

      return VerisureGraphQL.of({ execute });
    })
  );
}

const cookieHeader = (cookies: readonly SessionCookie[]) =>
  cookies.length === 0 ? {} : { Cookie: serializeCookieHeader(cookies) };

const graphQLErrorFromBody = (
  body: unknown,
  operationName: string
): GraphQLError | undefined => {
  const topLevel = classifyGraphQLResponse(body, operationName);
  if (topLevel !== undefined) {
    return topLevel;
  }

  const batch = Schema.decodeUnknownOption(GraphQLBatchBody)(body);
  if (Option.isNone(batch)) {
    return undefined;
  }

  for (const item of batch.value) {
    const error = classifyGraphQLResponse(item, operationName);
    if (error !== undefined) {
      return error;
    }
  }

  return undefined;
};

const GraphQLBatchBody = Schema.Array(Schema.Unknown);
