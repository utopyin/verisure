import { describe, expect, test } from "bun:test";
import {
  AuthenticationError,
  CredentialsRejected,
  GraphQLError,
  RateLimitError,
  ResponseError,
  classifyGraphQLResponse,
  classifyHttpError,
  responseSignalsRateLimit,
} from "./errors.ts";

describe("domain error classification", () => {
  test("detects Verisure rate-limit response text", () => {
    expect(responseSignalsRateLimit("AUT_00021 request limit exceeded")).toBe(true);
    expect(responseSignalsRateLimit("Too many requests")).toBe(true);
    expect(responseSignalsRateLimit("ordinary response")).toBe(false);
  });

  test("classifies HTTP errors structurally", () => {
    expect(classifyHttpError(401, "unauthorized")).toBeInstanceOf(AuthenticationError);
    expect(classifyHttpError(403, "forbidden")).toBeInstanceOf(AuthenticationError);
    expect(classifyHttpError(400, "bad credentials")).toBeInstanceOf(CredentialsRejected);
    expect(classifyHttpError(429, "too many requests")).toBeInstanceOf(RateLimitError);
    expect(classifyHttpError(503, "unavailable")).toBeInstanceOf(ResponseError);
  });

  test("classifies GraphQL error payloads", () => {
    const error = classifyGraphQLResponse({ errors: [{ message: "boom" }] }, "ArmState");
    expect(error).toBeInstanceOf(GraphQLError);
    expect(error?.operationName).toBe("ArmState");
    expect(classifyGraphQLResponse({ data: {} }, "ArmState")).toBeUndefined();
  });
});
