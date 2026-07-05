import type { CredentialSummary, InstallationSummary } from "@verisure/domain";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { CredentialRepository } from "../Repositories/CredentialRepository";
import { CredentialCrypto } from "../Security/CredentialCrypto";
import { CurrentCredential } from "../Security/RequestContext";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import { CredentialNotFound, ServiceUnavailable } from "./ServiceError";

export interface InstallationServiceShape {
  readonly list: Effect.Effect<
    readonly InstallationSummary[],
    ServiceUnavailable,
    CurrentCredential
  >;
  readonly setDefault: (
    giid: string | null
  ) => Effect.Effect<
    CredentialSummary,
    CredentialNotFound | ServiceUnavailable,
    CurrentCredential
  >;
  readonly getDefault: Effect.Effect<
    string | undefined,
    never,
    CurrentCredential
  >;
}

export class InstallationService extends Context.Service<
  InstallationService,
  InstallationServiceShape
>()("@verisure/server/InstallationService") {
  static readonly Test = (
    options: {
      readonly credential?: CredentialSummary;
      readonly installations?: readonly InstallationSummary[];
    } = {}
  ) =>
    Layer.succeed(
      InstallationService,
      InstallationService.of({
        getDefault: CurrentCredential.pipe(
          Effect.map((credential) => credential.defaultGiid ?? undefined)
        ),
        list: CurrentCredential.pipe(Effect.as(options.installations ?? [])),
        setDefault: (giid) =>
          CurrentCredential.pipe(
            Effect.map((credential) => ({
              alias: credential.alias,
              connectionStatus: credential.connectionStatus,
              createdAt: credential.createdAt.toISOString(),
              ...(giid === null ? {} : { defaultGiid: giid }),
              email: options.credential?.email ?? "user@example.com",
              id: credential.id,
              updatedAt: credential.updatedAt.toISOString(),
            }))
          ),
      })
    );

  static readonly Live = Layer.effect(
    InstallationService,
    Effect.gen(function* () {
      const crypto = yield* CredentialCrypto;
      const requests = yield* VerisureRequests;
      const repository = yield* CredentialRepository;

      const list = Effect.gen(function* () {
        const credentialRow = yield* CurrentCredential;
        const credential = yield* crypto.decryptCredential(credentialRow);
        return yield* requests.fetchAllInstallations({
          email: Redacted.value(credential.email),
        });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to list installations",
            })
        ),
        Effect.withSpan("InstallationService.list")
      );

      const setDefault: InstallationServiceShape["setDefault"] = (giid) =>
        Effect.gen(function* () {
          const credential = yield* CurrentCredential;
          const updated = yield* repository.setDefaultInstallation({
            giid,
            id: credential.id,
            now: new Date(),
            userId: credential.userId,
          });
          if (Option.isNone(updated)) {
            return yield* new CredentialNotFound({
              credentialId: credential.id,
              message:
                "Credential not found while setting default installation",
            });
          }
          const email = yield* crypto
            .decryptString(updated.value.encryptedEmail)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ServiceUnavailable({
                    cause,
                    message: "Unable to read credential",
                  })
              )
            );
          return credentialSummary(updated.value, email);
        }).pipe(
          Effect.catchTag("RepositoryError", (cause) =>
            Effect.fail(
              new ServiceUnavailable({
                cause,
                message: "Unable to set default installation",
              })
            )
          )
        );

      const getDefault = CurrentCredential.pipe(
        Effect.map((credential) => credential.defaultGiid ?? undefined)
      );

      return InstallationService.of({ getDefault, list, setDefault });
    })
  );
}

const credentialSummary = (
  row: {
    readonly alias: string;
    readonly connectionStatus: CredentialSummary["connectionStatus"];
    readonly createdAt: Date;
    readonly defaultGiid: string | null;
    readonly id: string;
    readonly updatedAt: Date;
  },
  email: string
): CredentialSummary => ({
  alias: row.alias,
  connectionStatus: row.connectionStatus,
  createdAt: row.createdAt.toISOString(),
  ...(row.defaultGiid === null ? {} : { defaultGiid: row.defaultGiid }),
  email,
  id: row.id,
  updatedAt: row.updatedAt.toISOString(),
});
