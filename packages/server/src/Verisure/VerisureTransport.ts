import {
  RequestError,
  ResponseError,
  classifyGraphQLResponse,
  classifyHttpError,
  responseSignalsRateLimit,
} from "@verisure/domain";
import type { GraphQLError, VerisureDomainError } from "@verisure/domain";
import type { GraphQLOperation } from "@verisure/graphql-client";
import { serializeCookieHeader } from "@verisure/shared/cookies";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpHeaders from "effect/unstable/http/Headers";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import type { VerisureBaseUrls } from "../Runtime/RuntimeConfig";
import type { SessionCookie } from "./VerisureSessionStore";

const DEFAULT_APPLICATION_ID = "PS_PYTHON" as const;
const DEFAULT_BASE_URLS = [
  "https://automation01.verisure.com",
  "https://automation02.verisure.com",
] as const;

export interface VerisureTransportOptions {
  readonly applicationId?: string;
  readonly baseUrls?: VerisureBaseUrls;
}

export interface VerisureTransportShape {
  readonly request: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<
    HttpClientResponse.HttpClientResponse,
    VerisureDomainError
  >;
  readonly executeGraphQL: <A, V>(input: {
    readonly operation: GraphQLOperation<A, V>;
    readonly cookies: readonly SessionCookie[];
  }) => Effect.Effect<A, VerisureDomainError>;
  readonly preferredBaseUrl: Effect.Effect<string>;
}

export class VerisureTransport extends Context.Service<
  VerisureTransport,
  VerisureTransportShape
>()("@verisure/server/VerisureTransport") {
  static readonly layer = (options: VerisureTransportOptions = {}) =>
    Layer.effect(
      VerisureTransport,
      Effect.gen(function* () {
        const applicationId = options.applicationId ?? DEFAULT_APPLICATION_ID;
        const baseUrls = options.baseUrls ?? DEFAULT_BASE_URLS;
        const httpClient = yield* HttpClient.HttpClient;
        const preferredBaseUrl = yield* Ref.make<string>(baseUrls[0]);

        const rememberPreferredBaseUrl = (baseUrl: string) =>
          Ref.set(preferredBaseUrl, baseUrl);

        const request: VerisureTransportShape["request"] = Effect.fn(
          "VerisureTransport.request"
        )(function* request(input) {
          const preferred = yield* Ref.get(preferredBaseUrl);
          const orderedBaseUrls = orderBaseUrls(baseUrls, preferred);
          let lastError: VerisureDomainError = new RequestError({
            message: "Verisure request did not run",
          });

          for (const baseUrl of orderedBaseUrls) {
            const httpRequest = prepareRequest(input, applicationId, baseUrl);
            const attempt = yield* Effect.gen(function* () {
              const httpResponse = yield* httpClient.execute(httpRequest);
              const text = yield* httpResponse.text;
              return { httpResponse, text };
            }).pipe(
              Effect.mapError(httpClientErrorToRequestError),
              Effect.matchEffect({
                onFailure: (error) =>
                  Effect.succeed({ _tag: "Failure" as const, error }),
                onSuccess: (response) =>
                  Effect.succeed({ _tag: "Success" as const, response }),
              })
            );

            if (attempt._tag === "Failure") {
              lastError = attempt.error;
              continue;
            }

            const { httpResponse, text } = attempt.response;

            if (httpResponse.status >= 500) {
              lastError = new ResponseError({
                message: `Invalid response, status code: ${httpResponse.status} - Data: ${text}`,
                statusCode: httpResponse.status,
                text,
              });
              continue;
            }

            if (httpResponse.status >= 400) {
              return yield* classifyHttpError(httpResponse.status, text);
            }

            if (httpResponse.status < 200 || httpResponse.status >= 300) {
              return yield* new ResponseError({
                message: `Invalid response, status code: ${httpResponse.status} - Data: ${text}`,
                statusCode: httpResponse.status,
                text,
              });
            }

            if (responseSignalsRateLimit(text)) {
              return yield* classifyHttpError(429, text);
            }

            if (text.includes("SYS_00004")) {
              lastError = new ResponseError({
                message: `Invalid response, status code: 502 - Data: ${text}`,
                statusCode: 502,
                text,
              });
              continue;
            }

            yield* rememberPreferredBaseUrl(baseUrl);
            return httpResponse;
          }

          return yield* lastError;
        });

        const executeGraphQL: VerisureTransportShape["executeGraphQL"] = (
          input
        ) =>
          Effect.gen(function* () {
            const response = yield* request(
              HttpClientRequest.post("/graphql", {
                headers: {
                  Accept: "application/json",
                  ...cookieHeader(input.cookies),
                },
              }).pipe(
                HttpClientRequest.bodyJsonUnsafe([input.operation.request])
              )
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

            const error = graphQLErrorFromBody(
              body,
              input.operation.operationName
            );
            if (error !== undefined) {
              return yield* error;
            }

            return yield* input.operation.decode(body).pipe(
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

        return VerisureTransport.of({
          executeGraphQL,
          preferredBaseUrl: Ref.get(preferredBaseUrl),
          request,
        });
      })
    ).pipe(Layer.provide(FetchHttpClient.layer));

  static readonly Live = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* RuntimeConfig;
      return VerisureTransport.layer({
        applicationId: Option.getOrUndefined(config.verisureApplicationId),
        baseUrls: Option.getOrUndefined(config.verisureBaseUrls),
      });
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

const httpClientErrorToRequestError = (
  cause: HttpClientError.HttpClientError
) =>
  new RequestError({
    cause,
    message:
      "cause" in cause.reason && cause.reason.cause instanceof Error
        ? cause.reason.cause.message
        : cause.message,
  });

const prepareRequest = (
  request: HttpClientRequest.HttpClientRequest,
  applicationId: string,
  baseUrl: string
): HttpClientRequest.HttpClientRequest => {
  const url = new URL(request.url, withTrailingSlash(baseUrl)).toString();
  const requestWithUrl = HttpClientRequest.setUrl(request, url);

  return HttpHeaders.has(requestWithUrl.headers, "APPLICATION_ID")
    ? requestWithUrl
    : HttpClientRequest.setHeader(
        requestWithUrl,
        "APPLICATION_ID",
        applicationId
      );
};

const orderBaseUrls = (
  baseUrls: readonly string[],
  preferred: string
): readonly string[] => {
  const withoutPreferred = baseUrls.filter((baseUrl) => baseUrl !== preferred);
  return baseUrls.includes(preferred)
    ? [preferred, ...withoutPreferred]
    : baseUrls;
};

const withTrailingSlash = (baseUrl: string) =>
  baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
