import * as Domain from "@verisure/domain";
import { describe, expect, test } from "vitest";

import { toDashboardRpcError, toSafeHttpError } from "./ErrorMapper";

describe("safe error mapping", () => {
  test("redacts sensitive upstream details from API-facing errors", () => {
    const responseError = toDashboardRpcError(
      new Domain.ResponseError({
        message:
          "Invalid response, status code: 500 - Data: session-cookie=secret",
        statusCode: 500,
        text: "session-cookie=secret",
      })
    );
    const requestError = toDashboardRpcError(
      new Domain.RequestError({ message: "network failed for secret-host" })
    );

    expect(responseError).toMatchObject({
      _tag: "VerisureUpstreamError",
      kind: "ResponseError",
      message: "Verisure returned an invalid response",
      statusCode: 500,
    });
    expect(JSON.stringify(responseError)).not.toContain("session-cookie");

    expect(toSafeHttpError(requestError)).toStrictEqual({
      body: {
        error: { code: "request_error", message: "Failed to reach Verisure" },
      },
      status: 502,
    });
  });

  test("derives REST status and stable error codes from RPC errors", () => {
    const rpcError = toDashboardRpcError(
      new Domain.RateLimitError({ message: "too many", statusCode: 429 })
    );

    expect(toSafeHttpError(rpcError)).toStrictEqual({
      body: { error: { code: "rate_limit_error", message: "too many" } },
      status: 429,
    });
  });
});
