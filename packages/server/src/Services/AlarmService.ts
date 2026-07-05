import type {
  AlarmMode,
  AlarmMutationResult,
  ArmState,
} from "@verisure/domain";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import { CredentialCrypto } from "../Security/CredentialCrypto";
import {
  CurrentCredential,
  CurrentInstallation,
} from "../Security/RequestContext";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import { AlarmCodeRequired, ServiceUnavailable } from "./ServiceError";

export interface AlarmServiceShape {
  readonly getArmState: Effect.Effect<
    ArmState,
    ServiceUnavailable,
    CurrentCredential | CurrentInstallation
  >;
  readonly setMode: (input: {
    readonly mode: AlarmMode;
    readonly code?: string;
  }) => Effect.Effect<
    AlarmMutationResult,
    AlarmCodeRequired | ServiceUnavailable,
    CurrentCredential | CurrentInstallation
  >;
  readonly toggleFull: (
    code?: string
  ) => Effect.Effect<
    AlarmMutationResult,
    AlarmCodeRequired | ServiceUnavailable,
    CurrentCredential | CurrentInstallation
  >;
}

export class AlarmService extends Context.Service<
  AlarmService,
  AlarmServiceShape
>()("@verisure/server/AlarmService") {
  static readonly Test = (options: { readonly armState?: ArmState } = {}) =>
    Layer.succeed(
      AlarmService,
      AlarmService.of({
        getArmState: CurrentInstallation.pipe(
          Effect.map((installation) => ({
            name: installation.giid,
            type: "DISARMED" as const,
            ...options.armState,
          }))
        ),
        setMode: (input) =>
          CurrentInstallation.pipe(
            Effect.map((installation) => ({
              accepted: true,
              giid: installation.giid,
              requestedMode: input.mode,
            }))
          ),
        toggleFull: () =>
          CurrentInstallation.pipe(
            Effect.map((installation) => ({
              accepted: true,
              giid: installation.giid,
              requestedMode: "ARMED_AWAY" as const,
            }))
          ),
      })
    );

  static readonly Live = Layer.effect(
    AlarmService,
    Effect.gen(function* () {
      const crypto = yield* CredentialCrypto;
      const requests = yield* VerisureRequests;

      const currentGiid = CurrentInstallation.pipe(
        Effect.map((installation) => installation.giid)
      );

      const getArmState = Effect.gen(function* () {
        const giid = yield* currentGiid;
        return yield* requests.armState({ giid });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to read alarm state",
            })
        ),
        Effect.withSpan("AlarmService.getArmState")
      );

      const resolveCode = Effect.fn("AlarmService.resolveCode")(function* (
        code?: string
      ) {
        if (code !== undefined && code.length > 0) {
          return code;
        }
        const credential = yield* CurrentCredential;
        const decrypted = yield* crypto.decryptCredential(credential).pipe(
          Effect.mapError(
            (cause) =>
              new ServiceUnavailable({
                cause,
                message: "Unable to read alarm code",
              })
          )
        );
        if (decrypted.pin === undefined) {
          return yield* new AlarmCodeRequired({
            message: "Alarm code is required for this credential",
          });
        }
        return Redacted.value(decrypted.pin);
      });

      const setMode: AlarmServiceShape["setMode"] = Effect.fn(
        "AlarmService.setMode"
      )(function* (input) {
        const giid = yield* currentGiid;
        const code = yield* resolveCode(input.code);
        return yield* requests
          .setAlarmMode({
            code,
            giid,
            mode: input.mode,
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new ServiceUnavailable({
                  cause,
                  message: "Unable to change alarm mode",
                })
            )
          );
      });

      const toggleFull: AlarmServiceShape["toggleFull"] = Effect.fn(
        "AlarmService.toggleFull"
      )(function* (code) {
        const current = yield* getArmState;
        const mode = current.type === "ARMED_AWAY" ? "DISARMED" : "ARMED_AWAY";
        return yield* setMode({ code, mode });
      });

      return AlarmService.of({
        getArmState,
        setMode,
        toggleFull,
      });
    })
  );
}
