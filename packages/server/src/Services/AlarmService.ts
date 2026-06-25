import type {
  AlarmMode,
  AlarmMutationResult,
  ArmState,
} from "@verisure/domain";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import type { CredentialCryptoError } from "../Security/CredentialCrypto";
import { CredentialCrypto } from "../Security/CredentialCrypto";
import {
  CurrentCredential,
  CurrentInstallation,
} from "../Security/RequestContext";
import type { VerisureRequestsError } from "../Verisure/VerisureRequests";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import { ServiceError } from "./ServiceError";

export type AlarmServiceError =
  | CredentialCryptoError
  | ServiceError
  | VerisureRequestsError;

export interface AlarmServiceShape {
  readonly getArmState: Effect.Effect<
    ArmState,
    AlarmServiceError,
    CurrentCredential | CurrentInstallation
  >;
  readonly setMode: (input: {
    readonly mode: AlarmMode;
    readonly code?: string;
  }) => Effect.Effect<
    AlarmMutationResult,
    AlarmServiceError,
    CurrentCredential | CurrentInstallation
  >;
  readonly toggleFull: (
    code?: string
  ) => Effect.Effect<
    AlarmMutationResult,
    AlarmServiceError,
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
      });

      const resolveCode = (code?: string) =>
        Effect.gen(function* () {
          if (code !== undefined && code.length > 0) {
            return code;
          }
          const credential = yield* CurrentCredential;
          const decrypted = yield* crypto.decryptCredential(credential);
          if (decrypted.pin === undefined) {
            return yield* new ServiceError({
              message: "Alarm code is required for this credential",
            });
          }
          return Redacted.value(decrypted.pin);
        });

      const setMode: AlarmServiceShape["setMode"] = (input) =>
        Effect.gen(function* () {
          const giid = yield* currentGiid;
          const code = yield* resolveCode(input.code);
          return yield* requests.setAlarmMode({
            code,
            giid,
            mode: input.mode,
          });
        });

      const toggleFull: AlarmServiceShape["toggleFull"] = (code) =>
        Effect.gen(function* () {
          const current = yield* getArmState;
          const mode =
            current.type === "ARMED_AWAY" ? "DISARMED" : "ARMED_AWAY";
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
