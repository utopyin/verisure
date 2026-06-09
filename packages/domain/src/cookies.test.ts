import { describe, expect, test } from "bun:test";
import {
  parseSetCookieHeader,
  serializeCookieHeader,
  serializeSetCookieHeader,
} from "./cookies.ts";

describe("cookie helpers", () => {
  test("parses Set-Cookie headers", () => {
    expect(
      parseSetCookieHeader(
        "vs-session=abc123; Domain=.verisure.com; Path=/; Expires=Tue, 09 Jun 2026 10:00:00 GMT; HttpOnly; Secure; SameSite=None",
      ),
    ).toEqual({
      name: "vs-session",
      value: "abc123",
      domain: ".verisure.com",
      path: "/",
      expires: new Date("Tue, 09 Jun 2026 10:00:00 GMT"),
      httpOnly: true,
      secure: true,
      sameSite: "None",
    });
  });

  test("serializes request Cookie header", () => {
    expect(
      serializeCookieHeader([
        { name: "a", value: "1" },
        { name: "b", value: "2" },
      ]),
    ).toBe("a=1; b=2");
  });

  test("serializes Set-Cookie header", () => {
    expect(
      serializeSetCookieHeader({
        name: "trust",
        value: "token",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      }),
    ).toBe("trust=token; Path=/; HttpOnly; Secure; SameSite=Lax");
  });
});
