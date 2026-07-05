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
      new Request("http://api.local/api/v1/alarm/status?giid=giid-1")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized", message: "Missing bearer token" },
    });
  });

  test("rejects invalid bearer tokens", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/alarm/status?giid=giid-1", {
        headers: { authorization: "Bearer invalid" },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized", message: "Invalid API token" },
    });
  });

  test("validates route payloads", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/alarm/status", {
        headers: { authorization: "Bearer valid" },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_input" },
    });
  });

  test("enforces token GIID restrictions before touching Verisure", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/alarm/status?giid=other-giid", {
        headers: { authorization: "Bearer valid" },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "forbidden",
        message: "API token is not allowed to access this installation",
      },
    });
  });

  test("verifies installation ownership for token-backed requests", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/alarm/status?giid=giid-1", {
        headers: { authorization: "Bearer valid" },
      }),
      { installations: [] }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "installation_not_found" },
    });
  });

  test("maps REST storage failures to service unavailable", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/alarm/status?giid=giid-1", {
        headers: { authorization: "Bearer valid" },
      }),
      { failAuthenticationStorage: true }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: {
        code: "service_unavailable",
        message: "Service storage is unavailable",
      },
    });
  });

  test("serves status and mutation routes with request-scoped services", async () => {
    const status = await runRest(
      new Request("http://api.local/api/v1/alarm/status?giid=giid-1", {
        headers: { authorization: "Bearer valid" },
      })
    );
    const toggle = await runRest(
      new Request("http://api.local/api/v1/alarm/toggle-full", {
        body: JSON.stringify({ giid: "giid-1" }),
        headers: {
          authorization: "Bearer valid",
          "content-type": "application/json",
        },
        method: "POST",
      })
    );
    const mode = await runRest(
      new Request("http://api.local/api/v1/alarm/mode", {
        body: JSON.stringify({ giid: "giid-1", mode: "ARMED_HOME" }),
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

  test("wraps unsupported content types in the REST error envelope", async () => {
    const response = await runRest(
      new Request("http://api.local/api/v1/alarm/mode", {
        body: "giid=giid-1&mode=DISARMED",
        headers: {
          authorization: "Bearer valid",
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      error: {
        code: "invalid_input",
        message: "Unsupported content type",
      },
    });
  });
});

const runRest = (
  request: Request,
  options: {
    readonly failAuthenticationStorage?: boolean;
    readonly installations?: readonly (typeof testInstallation)[];
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
    ) as Effect.Effect<Response, unknown, never>
  );

const testLayer = (
  options: {
    readonly failAuthenticationStorage?: boolean;
    readonly installations?: readonly (typeof testInstallation)[];
  } = {}
) =>
  Layer.mergeAll(
    Server.AlarmService.Test(),
    Layer.succeed(
      Server.ApiTokenService,
      Server.ApiTokenService.of({
        authenticate: ({ giid, plaintextToken, requiredScopes }) => {
          if (options.failAuthenticationStorage === true) {
            return Effect.fail(
              new Server.RepositoryError({ cause: "d1 down" })
            );
          }
          if (plaintextToken !== "valid") {
            return Effect.fail(
              new Server.ApiTokenError({ message: "Invalid API token" })
            );
          }
          const missingScope = (requiredScopes ?? []).find(
            (scope) =>
              ![
                Server.ShortcutAlarmReadScope,
                Server.ShortcutAlarmWriteScope,
              ].includes(scope as never)
          );
          if (missingScope !== undefined) {
            return Effect.fail(
              new Server.ApiTokenError({
                message: `API token is missing required scope: ${missingScope}`,
              })
            );
          }
          if (giid !== undefined && giid !== testInstallation.giid) {
            return Effect.fail(
              new Server.ApiTokenError({
                message: "API token is not allowed to access this installation",
              })
            );
          }
          return Effect.succeed({
            credential: testCredentialRow,
            token: {
              ...testApiToken,
              scopes: [
                Server.ShortcutAlarmReadScope,
                Server.ShortcutAlarmWriteScope,
              ],
            },
            user: testUser,
          });
        },
        create: () =>
          Effect.fail(new Server.ApiTokenError({ message: "not stubbed" })),
        hashPlaintextToken: () =>
          Effect.fail(new Server.ApiTokenError({ message: "not stubbed" })),
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
        fetchAllInstallations: () =>
          Effect.succeed(options.installations ?? [testInstallation]),
        setAlarmMode: () =>
          Effect.die("VerisureRequests.setAlarmMode not expected"),
        smartLocks: () =>
          Effect.die("VerisureRequests.smartLocks not expected"),
        smartPlugs: () =>
          Effect.die("VerisureRequests.smartPlugs not expected"),
      })
    )
  );
