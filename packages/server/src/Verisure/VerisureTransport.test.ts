import {
  AuthenticationError,
  RateLimitError,
  RequestError,
  ResponseError,
} from "@verisure/domain";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { describe, expect, test } from "vitest";

import { VerisureTransport } from "./VerisureTransport.ts";

type FetchLike = typeof globalThis.fetch;

const BASE_URLS = [
  "https://automation01.test",
  "https://automation02.test",
] as const;

describe(VerisureTransport, () => {
  test("adds APPLICATION_ID and preserves request cookies", async () => {
    const { calls, provideTransport } = makeFetch([response(200, "ok")]);

    await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        return yield* transport.request(
          HttpClientRequest.get("/auth/token", {
            headers: { Cookie: "vid=one; vs-refresh=two" },
          })
        );
      }).pipe(provideTransport)
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://automation01.test/auth/token");
    expect(calls[0]?.headers.get("APPLICATION_ID")).toBe("PS_PYTHON");
    expect(calls[0]?.headers.get("Cookie")).toBe("vid=one; vs-refresh=two");
  });

  test("fails over on network errors and remembers the working host", async () => {
    const { calls, provideTransport } = makeFetch([
      new Error("connection reset"),
      response(200, "ok"),
      response(200, "still ok"),
    ]);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        const first = yield* transport.request(HttpClientRequest.get("/ping"));
        const second = yield* transport.request(HttpClientRequest.get("/ping"));
        return { first, second };
      }).pipe(provideTransport)
    );

    expect(result.first.request.url).toBe("https://automation02.test/ping");
    expect(result.second.request.url).toBe("https://automation02.test/ping");
    expect(calls.map((call) => call.url)).toStrictEqual([
      "https://automation01.test/ping",
      "https://automation02.test/ping",
      "https://automation02.test/ping",
    ]);
  });

  test("fails over on 5xx responses", async () => {
    const { calls, provideTransport } = makeFetch([
      response(503, "unavailable"),
      response(200, "ok"),
    ]);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        return yield* transport.request(HttpClientRequest.post("/graphql"));
      }).pipe(provideTransport)
    );

    expect(result.request.url).toBe("https://automation02.test/graphql");
    expect(calls.map((call) => call.url)).toStrictEqual([
      "https://automation01.test/graphql",
      "https://automation02.test/graphql",
    ]);
  });

  test("fails over on SYS_00004 successful responses", async () => {
    const { calls, provideTransport } = makeFetch([
      response(200, JSON.stringify({ errors: [{ code: "SYS_00004" }] })),
      response(200, "ok"),
    ]);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        return yield* transport.request(HttpClientRequest.post("/graphql"));
      }).pipe(provideTransport)
    );

    expect(result.request.url).toBe("https://automation02.test/graphql");
    expect(calls).toHaveLength(2);
  });

  test("does not fail over on authentication errors", async () => {
    const { calls, provideTransport } = makeFetch([
      response(401, "unauthorized"),
    ]);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        return yield* Effect.flip(
          transport.request(HttpClientRequest.get("/auth/token"))
        );
      }).pipe(provideTransport)
    );

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(calls).toHaveLength(1);
  });

  test("classifies 200 rate-limit text as a rate-limit error", async () => {
    const { provideTransport } = makeFetch([
      response(200, "AUT_00021 request limit"),
    ]);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        return yield* Effect.flip(
          transport.request(HttpClientRequest.get("/auth/token"))
        );
      }).pipe(provideTransport)
    );

    expect(error).toBeInstanceOf(RateLimitError);
  });

  test("returns the last structured error when all failover attempts fail", async () => {
    const { provideTransport } = makeFetch([
      new Error("first network failure"),
      response(502, "bad gateway"),
    ]);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        return yield* Effect.flip(
          transport.request(HttpClientRequest.get("/auth/token"))
        );
      }).pipe(provideTransport)
    );

    expect(error).toBeInstanceOf(ResponseError);
    expect(error.message).toContain("bad gateway");
  });

  test("returns request errors when every host has a network failure", async () => {
    const { provideTransport } = makeFetch([
      new Error("first network failure"),
      new Error("second network failure"),
    ]);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* VerisureTransport;
        return yield* Effect.flip(
          transport.request(HttpClientRequest.get("/auth/token"))
        );
      }).pipe(provideTransport)
    );

    expect(error).toBeInstanceOf(RequestError);
    expect(error.message).toBe("second network failure");
  });
});

const response = (status: number, body: string) =>
  new Response(body, {
    status,
  });

const makeFetch = (results: readonly (Response | Error)[]) => {
  const queue = [...results];
  const calls: { readonly url: string; readonly headers: Headers }[] = [];
  const fetch: FetchLike = (input, init) => {
    calls.push({
      headers: new Headers(init?.headers),
      url: String(input),
    });
    const result = queue.shift();
    if (result === undefined) {
      return Promise.reject(new Error("Unexpected fetch call"));
    }
    if (result instanceof Error) {
      return Promise.reject(result);
    }
    return Promise.resolve(result);
  };

  const provideTransport = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(
      effect,
      VerisureTransport.layer({
        baseUrls: BASE_URLS,
      }).pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)))
    );

  return { calls, provideTransport };
};
