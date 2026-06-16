import { test, describe, expect } from "vitest";

import {
  parseSetCookieHeader,
  serializeCookieHeader,
  serializeSetCookieHeader,
} from "./cookies.ts";

describe("cookie helpers", () => {
  test("parses Set-Cookie headers", () => {
    expect(
      parseSetCookieHeader(
        "vs-session=abc123; Domain=.verisure.com; Path=/; Expires=Tue, 09 Jun 2026 10:00:00 GMT; HttpOnly; Secure; SameSite=None"
      )
    ).toStrictEqual({
      domain: ".verisure.com",
      expires: new Date("Tue, 09 Jun 2026 10:00:00 GMT"),
      httpOnly: true,
      name: "vs-session",
      path: "/",
      sameSite: "None",
      secure: true,
      value: "abc123",
    });
  });

  test("serializes request Cookie header", () => {
    expect(
      serializeCookieHeader([
        { name: "a", value: "1" },
        { name: "b", value: "2" },
      ])
    ).toBe("a=1; b=2");
  });

  test("serializes Set-Cookie header", () => {
    expect(
      serializeSetCookieHeader({
        httpOnly: true,
        name: "trust",
        path: "/",
        sameSite: "Lax",
        secure: true,
        value: "token",
      })
    ).toBe("trust=token; Path=/; HttpOnly; Secure; SameSite=Lax");
  });
});
