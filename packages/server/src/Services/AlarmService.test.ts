import { describe, expect, it } from "@effect/vitest";
import type { VerisureCredentialRow } from "@verisure/db/schema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import {
  CredentialCrypto,
  CredentialCryptoError,
} from "../Security/CredentialCrypto.ts";
import {
  CurrentCredential,
  CurrentInstallation,
} from "../Security/RequestContext.ts";
import { VerisureRequests } from "../Verisure/VerisureRequests.ts";
import { AlarmService } from "./AlarmService.ts";
import { ServiceError } from "./ServiceError.ts";

const credential = {
  alias: "Home",
  connectedAt: null,
  connectionStatus: "connected",
  connectionStatusMessage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  defaultGiid: "GIID",
  encryptedEmail: "encrypted-email",
  encryptedPassword: "encrypted-password",
  encryptedPin: "encrypted-pin",
  id: "credential-1",
  lastConnectionAttemptAt: null,
  mfaRequestedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  userId: "user-1",
} satisfies VerisureCredentialRow;

describe(AlarmService, () => {
  it.effect(
    "toggles full alarm from current state and resolves the stored PIN",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness([
          { type: "ARMED_AWAY" },
          {
            accepted: true,
            giid: "GIID",
            requestedMode: "DISARMED",
            transactionId: "transaction-1",
          },
        ]);

        const result = yield* Effect.gen(function* () {
          const alarm = yield* AlarmService;
          return yield* alarm.toggleFull();
        }).pipe(harness.provide);

        expect(result).toStrictEqual({
          accepted: true,
          giid: "GIID",
          requestedMode: "DISARMED",
          transactionId: "transaction-1",
        });
        expect(
          harness.operations.map((operation) => operation.operationName)
        ).toStrictEqual(["armState", "setAlarmMode"]);
        expect(harness.operations[1]?.variables).toStrictEqual({
          code: "4321",
          giid: "GIID",
          mode: "DISARMED",
        });
      })
  );

  it.effect("uses the request code before decrypting the stored PIN", () =>
    Effect.gen(function* () {
      const harness = makeHarness(
        [{ accepted: true, giid: "GIID", requestedMode: "ARMED_AWAY" }],
        {
          failDecrypt: true,
        }
      );

      const result = yield* Effect.gen(function* () {
        const alarm = yield* AlarmService;
        return yield* alarm.setMode({ code: "9999", mode: "ARMED_AWAY" });
      }).pipe(harness.provide);

      expect(result).toStrictEqual({
        accepted: true,
        giid: "GIID",
        requestedMode: "ARMED_AWAY",
      });
      expect(harness.operations[0]?.variables).toStrictEqual({
        code: "9999",
        giid: "GIID",
        mode: "ARMED_AWAY",
      });
    })
  );

  it.effect(
    "requires an alarm code when no request code or stored PIN exists",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness([], { pin: undefined });

        const error = yield* Effect.gen(function* () {
          const alarm = yield* AlarmService;
          return yield* Effect.flip(alarm.setMode({ mode: "DISARMED" }));
        }).pipe(harness.provide);

        expect(error).toBeInstanceOf(ServiceError);
        expect(error.message).toBe(
          "Alarm code is required for this credential"
        );
      })
  );
});

const makeHarness = (
  responses: readonly unknown[],
  options: { readonly failDecrypt?: boolean; readonly pin?: string } = {}
) => {
  const queue = [...responses];
  const operations: {
    readonly operationName: string;
    readonly variables: Record<string, unknown>;
  }[] = [];

  const nextResponse = <A>() => Effect.sync(() => queue.shift() as A);

  const requests = Layer.succeed(
    VerisureRequests,
    VerisureRequests.of({
      armState: (input) => {
        operations.push({ operationName: "armState", variables: input });
        return nextResponse();
      },
      climate: () => Effect.die(new Error("climate was not expected")),
      doorWindows: () => Effect.die(new Error("doorWindows was not expected")),
      fetchAllInstallations: () =>
        Effect.die(new Error("fetchAllInstallations was not expected")),
      setAlarmMode: (input) => {
        operations.push({ operationName: "setAlarmMode", variables: input });
        return nextResponse();
      },
      smartLocks: () => Effect.die(new Error("smartLocks was not expected")),
      smartPlugs: () => Effect.die(new Error("smartPlugs was not expected")),
    })
  );

  const decryptedPin = () => {
    if (options.pin === undefined && !("pin" in options)) {
      return { pin: Redacted.make("4321") };
    }
    if (options.pin === undefined) {
      return {};
    }
    return { pin: Redacted.make(options.pin) };
  };

  const crypto = Layer.succeed(
    CredentialCrypto,
    CredentialCrypto.of({
      decryptCredential: (row) =>
        options.failDecrypt === true
          ? Effect.fail(
              new CredentialCryptoError({ message: "decrypt called" })
            )
          : Effect.succeed({
              email: Redacted.make("user@example.com"),
              id: row.id,
              password: Redacted.make("secret"),
              ...decryptedPin(),
              userId: row.userId,
            }),
      decryptString: () => Effect.succeed("decrypted"),
      encryptCredential: () =>
        Effect.succeed({
          encryptedEmail: "encrypted-email",
          encryptedPassword: "encrypted-password",
          encryptedPin: "encrypted-pin",
        }),
      encryptString: (value) => Effect.succeed(value),
    })
  );

  const layer = AlarmService.Live.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        requests,
        crypto,
        Layer.succeed(CurrentCredential, credential),
        Layer.succeed(CurrentInstallation, { giid: "GIID" })
      )
    )
  );

  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, layer);

  return { operations, provide };
};
