import { describe, expect, it } from "@effect/vitest";
import { testCredentialRow } from "@verisure/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { CredentialCrypto } from "../Security/CredentialCrypto";
import {
  CurrentCredential,
  CurrentInstallation,
} from "../Security/RequestContext";
import type { VerisureRequestsTestOperation } from "../Verisure/VerisureRequests";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import type { AlarmServiceShape } from "./AlarmService";
import { AlarmService } from "./AlarmService";
import { ServiceError } from "./ServiceError";

const toggleFull = Effect.fn("AlarmServiceTest.toggleFull")(function* () {
  const alarm = yield* AlarmService;
  return yield* alarm.toggleFull();
});

const setMode = Effect.fn("AlarmServiceTest.setMode")(function* (
  input: Parameters<AlarmServiceShape["setMode"]>[0]
) {
  const alarm = yield* AlarmService;
  return yield* alarm.setMode(input);
});

const setModeFailure = Effect.fn("AlarmServiceTest.setModeFailure")(function* (
  input: Parameters<AlarmServiceShape["setMode"]>[0]
) {
  return yield* Effect.flip(setMode(input));
});

const credential = {
  ...testCredentialRow,
  defaultGiid: "GIID",
  encryptedPin: "encrypted-pin",
};

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

        const result = yield* toggleFull().pipe(harness.provide);

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

      const result = yield* setMode({ code: "9999", mode: "ARMED_AWAY" }).pipe(
        harness.provide
      );

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

        const error = yield* setModeFailure({ mode: "DISARMED" }).pipe(
          harness.provide
        );

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
  const operations: VerisureRequestsTestOperation[] = [];

  const layer = AlarmService.Live.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        VerisureRequests.Test({ operations, responses }),
        CredentialCrypto.Test(options),
        Layer.succeed(CurrentCredential, credential),
        Layer.succeed(CurrentInstallation, { giid: "GIID" })
      )
    )
  );

  const provide = <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
  ) => Effect.provide(effect, layer);

  return { operations, provide };
};
