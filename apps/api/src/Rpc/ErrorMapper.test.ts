import * as Domain from "@verisure/domain";
import { describe, expect, test } from "vitest";

import { toDashboardRpcError } from "./ErrorMapper";

describe("dashboard RPC error mapping", () => {
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

    expect(requestError).toMatchObject({
      _tag: "VerisureUpstreamError",
      kind: "RequestError",
      message: "Failed to reach Verisure",
    });
  });

  test("preserves safe upstream status metadata on RPC errors", () => {
    const rpcError = toDashboardRpcError(
      new Domain.RateLimitError({ message: "too many", statusCode: 429 })
    );

    expect(rpcError).toMatchObject({
      _tag: "VerisureUpstreamError",
      kind: "RateLimitError",
      message: "too many",
      statusCode: 429,
    });
  });
});
