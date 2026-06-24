import type { VerisureCredentialRow } from "@verisure/db/schema";
import type { CredentialSummary, InstallationSummary } from "@verisure/domain";
import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import { RuntimeContext } from "alchemy";
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

const user = {
  email: "user@example.com",
  id: "user-1",
  name: "User One",
} satisfies Server.AuthUser;

const authSession = Option.some({
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  user,
} satisfies Server.AuthSession);

const credentialRow = {
  alias: "Home",
  connectedAt: null,
  connectionStatus: "connected",
  connectionStatusMessage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  defaultGiid: "giid-1",
  encryptedEmail: "encrypted-email",
  encryptedPassword: "encrypted-password",
  encryptedPin: null,
  id: "cred-1",
  lastConnectionAttemptAt: null,
  mfaRequestedAt: null,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  userId: user.id,
} satisfies VerisureCredentialRow;

const credentialSummary = {
  alias: credentialRow.alias,
  connectionStatus: credentialRow.connectionStatus,
  createdAt: credentialRow.createdAt.toISOString(),
  defaultGiid: credentialRow.defaultGiid,
  email: user.email,
  id: credentialRow.id,
  updatedAt: credentialRow.updatedAt.toISOString(),
} satisfies CredentialSummary;

const installation = {
  alias: "Home",
  giid: "giid-1",
} satisfies InstallationSummary;

const apiToken = {
  allowedGiids: [installation.giid],
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  credentialId: credentialRow.id,
  displayPrefix: "vs_abc123…",
  expiresAt: null,
  id: "token-1",
  lastUsedAt: null,
  revokedAt: null,
  scopes: [Server.ShortcutAlarmReadScope],
  tokenHash: "hash",
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
  userId: user.id,
};

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
          credentialId: credentialRow.id,
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
          credentialId: credentialRow.id,
          giid: installation.giid,
        });
        const climate = yield* client["Device.ListClimate"]({
          credentialId: credentialRow.id,
          giid: installation.giid,
        });
        const shortcut = yield* client["Shortcut.ExportShortcut"]({
          credentialId: credentialRow.id,
          giid: installation.giid,
          template: "toggle-full",
        });
        const tokens = yield* client["Shortcut.ListApiTokens"]({
          credentialId: credentialRow.id,
        });
        return { alarmState, climate, credentials, shortcut, tokens };
      })
    );

    expect(result.credentials).toStrictEqual([credentialSummary]);
    expect(result.alarmState).toMatchObject({
      name: "cred-1:giid-1",
      type: "DISARMED",
    });
    expect(result.climate).toStrictEqual([]);
    expect(result.shortcut).toMatchObject({
      bearerToken: "vs_plaintext",
      credentialId: credentialRow.id,
      template: "toggle-full",
    });
    expect(result.tokens).toStrictEqual([
      {
        allowedGiids: [installation.giid],
        createdAt: "2026-01-03T00:00:00.000Z",
        credentialId: credentialRow.id,
        displayPrefix: "vs_abc123…",
        id: "token-1",
        scopes: [Server.ShortcutAlarmReadScope],
      },
    ]);
  });
});

const runRpc = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: TestOptions = {}
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(testLayer(options)),
      Effect.scoped
    ) as Effect.Effect<A, E, never>
  );

const makeClient = RpcTest.makeClient(Rpcs);

const testLayer = (options: TestOptions) =>
  Layer.mergeAll(
    HandlersLive.pipe(Layer.provide(testServices(options))),
    AuthClientLive
  );

const testServices = (options: TestOptions) =>
  Layer.mergeAll(
    Layer.succeed(RuntimeContext, {
      Type: "TestRuntime",
      env: {},
      get: <T>() => Effect.succeed(undefined as T | undefined),
      id: "test-runtime",
      set: (id) => Effect.succeed(id),
    }),
    Layer.succeed(
      Server.BetterAuthService,
      Server.BetterAuthService.of({
        auth: Effect.die("auth instance not used in RPC tests"),
        fetch: Effect.die("auth fetch not used in RPC tests"),
        getSession: () => Effect.succeed(options.session ?? authSession),
      })
    ),
    Layer.succeed(
      Server.CredentialRepository,
      Server.CredentialRepository.of({
        create: () => Effect.die("CredentialRepository.create not expected"),
        delete: () => Effect.die("CredentialRepository.delete not expected"),
        getById: () => Effect.die("CredentialRepository.getById not expected"),
        getOwnedById: () =>
          Effect.succeed(options.ownedCredential ?? Option.some(credentialRow)),
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
            email: Redacted.make(user.email),
            id: row.id,
            password: Redacted.make("password"),
            userId: row.userId,
          }),
        decryptString: () => Effect.succeed(user.email),
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
          Effect.succeed(options.installations ?? [installation]),
        setAlarmMode: () =>
          Effect.die("VerisureRequests.setAlarmMode not expected"),
        smartLocks: () =>
          Effect.die("VerisureRequests.smartLocks not expected"),
        smartPlugs: () =>
          Effect.die("VerisureRequests.smartPlugs not expected"),
      })
    ),
    Layer.succeed(
      Server.CredentialService,
      Server.CredentialService.of({
        checkConnection: Effect.succeed([installation]),
        create: () => Effect.succeed(credentialSummary),
        delete: Server.CurrentCredential.pipe(Effect.asVoid),
        list: Server.CurrentUser.pipe(Effect.as([credentialSummary])),
        logout: Effect.void,
        requestMfa: Server.CurrentCredential.pipe(
          Effect.map((credential) => ({
            credentialId: credential.id,
            status: "mfa_requested" as const,
          }))
        ),
        validateMfa: () =>
          Effect.succeed({
            credential: credentialSummary,
            installations: [installation],
          }),
      })
    ),
    Layer.succeed(
      Server.InstallationService,
      Server.InstallationService.of({
        getDefault: Server.CurrentCredential.pipe(
          Effect.map((credential) => credential.defaultGiid ?? undefined)
        ),
        list: Server.CurrentCredential.pipe(Effect.as([installation])),
        setDefault: (giid) =>
          Server.CurrentCredential.pipe(
            Effect.as({
              ...credentialSummary,
              ...(giid === null ? {} : { defaultGiid: giid }),
            })
          ),
      })
    ),
    Layer.succeed(
      Server.AlarmService,
      Server.AlarmService.of({
        getArmState: Effect.gen(function* () {
          const credential = yield* Server.CurrentCredential;
          const currentInstallation = yield* Server.CurrentInstallation;
          return {
            name: `${credential.id}:${currentInstallation.giid}`,
            type: "DISARMED",
          };
        }),
        setMode: (input) =>
          Server.CurrentInstallation.pipe(
            Effect.map((currentInstallation) => ({
              accepted: true,
              giid: currentInstallation.giid,
              requestedMode: input.mode,
            }))
          ),
        toggleFull: () =>
          Server.CurrentInstallation.pipe(
            Effect.map((currentInstallation) => ({
              accepted: true,
              giid: currentInstallation.giid,
              requestedMode: "ARMED_AWAY" as const,
            }))
          ),
      })
    ),
    Layer.succeed(
      Server.DeviceService,
      Server.DeviceService.of({
        listClimate: Server.CurrentInstallation.pipe(Effect.as([])),
        listDoorWindows: Server.CurrentInstallation.pipe(Effect.as([])),
        listSmartLocks: Server.CurrentInstallation.pipe(Effect.as([])),
        listSmartPlugs: Server.CurrentInstallation.pipe(Effect.as([])),
      })
    ),
    Layer.succeed(
      Server.ApiTokenService,
      Server.ApiTokenService.of({
        authenticate: () =>
          Effect.die("ApiTokenService.authenticate not expected"),
        create: () => Effect.die("ApiTokenService.create not expected"),
        hashPlaintextToken: () =>
          Effect.die("ApiTokenService.hashPlaintextToken not expected"),
        list: () => Effect.succeed([apiToken]),
        revoke: () => Effect.void,
      })
    ),
    Layer.succeed(
      Server.ShortcutExportService,
      Server.ShortcutExportService.of({
        exportShortcut: (payload) =>
          Effect.succeed({
            apiToken,
            apiUrl: "https://verisure.utopy.sh/api/v1",
            bearerToken: "vs_plaintext",
            credentialId: payload.credentialId,
            giid: payload.giid,
            instructions: ["guided fallback"],
            shortcutName: "Verisure Toggle Full Alarm",
            template: payload.template,
          }),
      })
    )
  );
