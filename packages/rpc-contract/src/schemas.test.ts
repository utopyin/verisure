import { test, describe, expect } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  AlarmMode,
  CreateCredentialPayload,
  InstallationSummary,
  ShortcutExportResult,
  VerisureUpstreamError,
} from ".";

describe("dashboard RPC schemas", () => {
  test("decodes representative installation payloads", () => {
    const installation = Schema.decodeUnknownSync(InstallationSummary)({
      address: {
        city: "Paris",
        postalNumber: "75000",
        street: "Main Street 1",
      },
      alias: "Home",
      customerType: "RESIDENTIAL",
      giid: "123456",
      pinCodeLength: 4,
    });

    expect(installation.giid).toBe("123456");
    expect(installation.address?.city).toBe("Paris");
  });

  test("validates alarm modes", () => {
    expect(Schema.decodeUnknownSync(AlarmMode)("ARMED_HOME")).toBe(
      "ARMED_HOME"
    );
    expect(() => Schema.decodeUnknownSync(AlarmMode)("NIGHT")).toThrow(
      'Expected "DISARMED" | "ARMED_AWAY" | "ARMED_HOME", got "NIGHT"'
    );
  });

  test("decodes create credential payload", () => {
    const payload = Schema.decodeUnknownSync(CreateCredentialPayload)({
      alias: "Home",
      email: "user@example.com",
      password: "secret",
      pin: "1234",
    });

    expect(payload.email).toBe("user@example.com");
    expect(payload.pin).toBe("1234");
  });

  test("decodes shortcut export result", () => {
    const result = Schema.decodeUnknownSync(ShortcutExportResult)({
      apiUrl: "https://verisure.utopy.sh/api/v1/alarm/toggle-full",
      bearerToken: "vs_live_token",
      credentialId: "cred_1",
      giid: "123456",
      instructions: ["Install shortcut", "Keep token private"],
      shortcutName: "Toggle Verisure",
      template: "toggle-full",
    });

    expect(result.template).toBe("toggle-full");
    expect(result.instructions).toHaveLength(2);
  });

  test("decodes typed upstream errors", () => {
    const error = Schema.decodeUnknownSync(VerisureUpstreamError)({
      _tag: "VerisureUpstreamError",
      kind: "RateLimitError",
      message: "too many requests",
      statusCode: 429,
    });

    expect(error.kind).toBe("RateLimitError");
  });
});
