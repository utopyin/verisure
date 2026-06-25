import type { VerisureCredentialRow } from "@verisure/db/schema";
import type { InstallationSummary } from "@verisure/domain";
import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import {
  RuntimeContextTestLayer,
  testApiToken,
  testAuthSession,
  testCredentialRow,
  testCredentialSummary,
  testInstallation,
  testUser,
} from "@verisure/test";
import type { Scope } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";
import * as RpcTest from "effect/unstable/rpc/RpcTest";
import { describe, expect, test } from "vitest";

import { AuthMiddleware } from "./AuthMiddleware";
import { HandlersLive, Rpcs } from "./index";

interface TestOptions {
  readonly session?: Option.Option<Server.AuthSession>;
  readonly ownedCredential?: Option.Option<VerisureCredentialRow>;
  readonly installations?: readonly InstallationSummary[];
}

const AuthClientLive = RpcMiddleware.layerClient(
  AuthMiddleware,
  ({ next, request }) => next(request)
);

describe("dashboard RPC handlers", () => {
  test("unauthenticated calls fail with typed Unauthorized", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const client = yield* makeClient;
        return yield* client["Credential.ListCredentials"]().pipe(
          Effect.result
        );
      }),
      { session: Option.none() }
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(RpcContract.Unauthorized);
      expect(result.failure).toMatchObject({ message: "Unauthorized" });
    }
  });

  test("credential scope middleware rejects credentials not owned by the current user", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const client = yield* makeClient;
        return yield* client["Credential.DeleteCredential"]({
          credentialId: "missing-credential",
        }).pipe(Effect.result);
      }),
      { ownedCredential: Option.none() }
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(RpcContract.CredentialNotFound);
      expect(result.failure).toMatchObject({
        credentialId: "missing-credential",
        message: "Credential not found",
      });
    }
  });

  test("installation scope middleware rejects installations outside the scoped credential", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const client = yield* makeClient;
        return yield* client["Alarm.GetArmState"]({
          credentialId: testCredentialRow.id,
          giid: "missing-giid",
        }).pipe(Effect.result);
      }),
      { installations: [{ alias: "Other", giid: "other-giid" }] }
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(RpcContract.InstallationNotFound);
      expect(result.failure).toMatchObject({
        giid: "missing-giid",
        message: "Installation not found",
      });
    }
  });

  test("handlers receive request-scoped services from middleware and delegate to services", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const client = yield* makeClient;
        const credentials = yield* client["Credential.ListCredentials"]();
        const alarmState = yield* client["Alarm.GetArmState"]({
          credentialId: testCredentialRow.id,
          giid: testInstallation.giid,
        });
        const climate = yield* client["Device.ListClimate"]({
          credentialId: testCredentialRow.id,
          giid: testInstallation.giid,
        });
        const shortcut = yield* client["Shortcut.ExportShortcut"]({
          credentialId: testCredentialRow.id,
          giid: testInstallation.giid,
          template: "toggle-full",
        });
        const tokens = yield* client["Shortcut.ListApiTokens"]({
          credentialId: testCredentialRow.id,
        });
        return { alarmState, climate, credentials, shortcut, tokens };
      })
    );

    expect(result.credentials).toStrictEqual([testCredentialSummary]);
    expect(result.alarmState).toMatchObject({
      name: `${testCredentialRow.id}:${testInstallation.giid}`,
      type: "DISARMED",
    });
    expect(result.climate).toStrictEqual([]);
    expect(result.shortcut).toMatchObject({
      bearerToken: "vs_plaintext",
      credentialId: testCredentialRow.id,
      template: "toggle-full",
    });
    expect(result.tokens).toStrictEqual([
      {
        allowedGiids: [testInstallation.giid],
        createdAt: "2026-01-03T00:00:00.000Z",
        credentialId: testCredentialRow.id,
        displayPrefix: "vs_abc123…",
        id: "token-1",
        scopes: [Server.ShortcutAlarmReadScope],
      },
    ]);
  });
});

const runRpc = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    Layer.Success<ReturnType<typeof testLayer>> | Scope.Scope
  >,
  options: TestOptions = {}
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(testLayer(options)), Effect.scoped)
  );

const makeClient = RpcTest.makeClient(Rpcs);

const testLayer = (options: TestOptions) =>
  Layer.mergeAll(
    HandlersLive.pipe(Layer.provide(testServices(options))),
    AuthClientLive
  );

const testServices = (options: TestOptions) =>
  Layer.mergeAll(
    RuntimeContextTestLayer,
    Server.BetterAuthService.Test({
      session: options.session ?? Option.some(testAuthSession),
    }),
    Server.CredentialService.Test({
      credential: testCredentialSummary,
      installations: [testInstallation],
    }),
    Server.InstallationService.Test({
      credential: testCredentialSummary,
      installations: [testInstallation],
    }),
    Server.AlarmService.Test({
      armState: {
        name: `${testCredentialRow.id}:${testInstallation.giid}`,
        type: "DISARMED",
      },
    }),
    Server.DeviceService.Test(),
    Server.ApiTokenService.Test({ tokens: [testApiToken] }),
    Server.ShortcutExportService.Test({ apiToken: testApiToken }),
    scopeMiddlewareDependencies(options)
  );

const scopeMiddlewareDependencies = (options: TestOptions) =>
  Layer.mergeAll(
    Layer.succeed(
      Server.CredentialRepository,
      Server.CredentialRepository.of({
        create: () => Effect.die("CredentialRepository.create not expected"),
        delete: () => Effect.die("CredentialRepository.delete not expected"),
        getById: () => Effect.die("CredentialRepository.getById not expected"),
        getOwnedById: () =>
          Effect.succeed(
            options.ownedCredential ?? Option.some(testCredentialRow)
          ),
        listForUser: () =>
          Effect.die("CredentialRepository.listForUser not expected"),
        setConnectionStatus: () =>
          Effect.die("CredentialRepository.setConnectionStatus not expected"),
        setDefaultInstallation: () =>
          Effect.die(
            "CredentialRepository.setDefaultInstallation not expected"
          ),
        update: () => Effect.die("CredentialRepository.update not expected"),
      })
    ),
    Layer.succeed(
      Server.CredentialCrypto,
      Server.CredentialCrypto.of({
        decryptCredential: (row) =>
          Effect.succeed({
            email: Redacted.make(testUser.email),
            id: row.id,
            password: Redacted.make("password"),
            userId: row.userId,
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
