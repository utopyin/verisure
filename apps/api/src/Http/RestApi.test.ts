import * as Server from "@verisure/server";
import {
  testApiToken,
  testCredentialRow,
  testInstallation,
  testUser,
} from "@verisure/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import {
  HttpServerRequest,
  fromWeb as httpServerRequestFromWeb,
} from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { describe, expect, test } from "vitest";

import { ShortcutRestHttp } from "./RestApi";

describe("Shortcut REST API", () => {
  test("rejects missing bearer tokens", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/status")
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("");
  });

  test("rejects invalid bearer tokens", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/status", {
        headers: { authorization: "Bearer invalid" },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("");
  });

  test("rejects empty bearer credentials", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/status", {
        headers: { authorization: "Bearer " },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("");
  });

  test("validates route payloads", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/mode", {
        body: JSON.stringify({ mode: "not-a-mode" }),
        headers: {
          authorization: "Bearer valid",
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("");
  });

  test("enforces token GIID restrictions before touching Verisure", async () => {
    const calls: string[] = [];
    const response = await runRest(
      new Request(
        "http://api.local/api/v1/installations/other-giid/alarm/status",
        { headers: { authorization: "Bearer valid" } }
      ),
      { requestCalls: calls }
    );

    expect(response.status).toBe(403);
    expect(calls).toStrictEqual([]);
    await expect(response.text()).resolves.toBe("");
  });

  test("verifies installation ownership for token-backed requests", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/status", {
        headers: { authorization: "Bearer valid" },
      }),
      { installations: [] }
    );

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("");
  });

  test("maps REST storage failures to service unavailable", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/status", {
        headers: { authorization: "Bearer valid" },
      }),
      { failAuthenticationStorage: true }
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("");
  });

  test("surfaces Verisure MFA as the remaining product-specific response", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/status", {
        headers: { authorization: "Bearer valid" },
      }),
      {
        requestFailure: new Server.VerisureRequestsError({
          reason: new Server.VerisureRequestsMfaRequired({
            message: "MFA required",
          }),
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      _tag: "ShortcutMfaRequired",
      message: "MFA required",
    });
  });

  test("serves status and mutation routes with request-scoped services", async () => {
    const status = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/status", {
        headers: { authorization: "Bearer valid" },
      })
    );
    const toggle = await runRest(
      new Request(
        "http://api.local/api/v1/installations/giid-1/alarm/toggle-full",
        {
          body: JSON.stringify({}),
          headers: {
            authorization: "Bearer valid",
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );
    const mode = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/mode", {
        body: JSON.stringify({ mode: "ARMED_HOME" }),
        headers: {
          authorization: "Bearer valid",
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      name: "giid-1",
      type: "DISARMED",
    });
    expect(toggle.status).toBe(200);
    await expect(toggle.json()).resolves.toMatchObject({
      giid: "giid-1",
      requestedMode: "ARMED_AWAY",
    });
    expect(mode.status).toBe(200);
    await expect(mode.json()).resolves.toMatchObject({
      giid: "giid-1",
      requestedMode: "ARMED_HOME",
    });
  });

  test("returns the standard unsupported content-type response", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/installations/giid-1/alarm/mode", {
        body: "mode=DISARMED",
        headers: {
          authorization: "Bearer valid",
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(415);
    await expect(response.text()).resolves.toContain(
      "Unsupported content-type"
    );
  });
});

const runRest = (
  request: Request,
  options: {
    readonly failAuthenticationStorage?: boolean;
    readonly installations?: readonly (typeof testInstallation)[];
    readonly requestCalls?: string[];
    readonly requestFailure?: Server.VerisureRequestsError;
  } = {}
) =>
  Effect.runPromise(
    ShortcutRestHttp.pipe(
      Effect.flatMap((httpApp) =>
        httpApp.pipe(
          Effect.provideService(
            HttpServerRequest,
            httpServerRequestFromWeb(request)
          ),
          Effect.map((response) => HttpServerResponse.toWeb(response))
        )
      ),
      Effect.provide(testLayer(options)),
      Effect.scoped
    ) as unknown as Effect.Effect<Response, unknown, never>
  );

const testLayer = (
  options: {
    readonly failAuthenticationStorage?: boolean;
    readonly installations?: readonly (typeof testInstallation)[];
    readonly requestCalls?: string[];
    readonly requestFailure?: Server.VerisureRequestsError;
  } = {}
) =>
  Layer.mergeAll(
    Server.AlarmService.Test(),
    Layer.succeed(
      Server.ApiTokenService,
      Server.ApiTokenService.of({
        authenticate: ({ plaintextToken }) => {
          if (options.failAuthenticationStorage === true) {
            return Effect.fail(
              new Server.ServiceUnavailable({
                cause: "d1 down",
                message: "Service storage is unavailable",
              })
            );
          }
          if (plaintextToken !== "valid") {
            return Effect.fail(
              new Server.ApiTokenUnauthorized({ message: "Invalid API token" })
            );
          }
          return Effect.succeed({
            credential: testCredentialRow,
            token: {
              ...testApiToken,
              allowedGiids: [testInstallation.giid],
              scopes: [
                Server.ShortcutAlarmReadScope,
                Server.ShortcutAlarmWriteScope,
              ],
            },
            user: testUser,
          });
        },
        create: () =>
          Effect.fail(
            new Server.ServiceUnavailable({ message: "not stubbed" })
          ),
        hashPlaintextToken: () =>
          Effect.fail(
            new Server.ServiceUnavailable({ message: "not stubbed" })
          ),
        list: () => Effect.succeed([]),
        revoke: () => Effect.void,
      })
    ),
    Layer.succeed(
      Server.CredentialCrypto,
      Server.CredentialCrypto.of({
        decryptCredential: () =>
          Effect.succeed({
            email: Redacted.make(testUser.email),
            id: testCredentialRow.id,
            password: Redacted.make("password"),
            userId: testUser.id,
          }),
        decryptString: () => Effect.succeed(testUser.email),
        encryptCredential: () =>
          Effect.succeed({
            encryptedEmail: "encrypted-email",
            encryptedPassword: "encrypted-password",
            encryptedPin: null,
          }),
        encryptString: (value) => Effect.succeed(`encrypted:${value}`),
      })
    ),
    Layer.succeed(
      Server.VerisureRequests,
      Server.VerisureRequests.of({
        armState: () => Effect.die("VerisureRequests.armState not expected"),
        climate: () => Effect.die("VerisureRequests.climate not expected"),
        doorWindows: () =>
          Effect.die("VerisureRequests.doorWindows not expected"),
        fetchAllInstallations: () => {
          options.requestCalls?.push("fetchAllInstallations");
          return options.requestFailure === undefined
            ? Effect.succeed(options.installations ?? [testInstallation])
            : Effect.fail(options.requestFailure);
        },
        setAlarmMode: () =>
          Effect.die("VerisureRequests.setAlarmMode not expected"),
        smartLocks: () =>
          Effect.die("VerisureRequests.smartLocks not expected"),
        smartPlugs: () =>
          Effect.die("VerisureRequests.smartPlugs not expected"),
      })
    )
  );
