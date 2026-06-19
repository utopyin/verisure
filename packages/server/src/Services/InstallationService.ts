import type { CredentialSummary, InstallationSummary } from "@verisure/domain";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { CredentialRepository } from "../Repositories/CredentialRepository.ts";
import type { RepositoryError } from "../Repositories/RepositoryError.ts";
import { CredentialCrypto } from "../Security/CredentialCrypto.ts";
import type { CredentialCryptoError } from "../Security/CredentialCrypto.ts";
import { CurrentCredential } from "../Security/RequestContext.ts";
import type { VerisureAuthError } from "../Verisure/VerisureAuth.ts";
import { VerisureRequests } from "../Verisure/VerisureRequests.ts";
import type { VerisureRequestsError } from "../Verisure/VerisureRequests.ts";
import { ServiceError } from "./ServiceError.ts";

export type InstallationServiceError =
  | CredentialCryptoError
  | RepositoryError
  | ServiceError
  | VerisureAuthError
  | VerisureRequestsError;

export interface InstallationServiceShape {
  readonly list: Effect.Effect<
    readonly InstallationSummary[],
    InstallationServiceError,
    CurrentCredential
  >;
  readonly setDefault: (
    giid: string | null
  ) => Effect.Effect<
    CredentialSummary,
    InstallationServiceError,
    CurrentCredential
  >;
  readonly getDefault: Effect.Effect<
    string | undefined,
    InstallationServiceError,
    CurrentCredential
  >;
}

export class InstallationService extends Context.Service<
  InstallationService,
  InstallationServiceShape
>()("@verisure/server/InstallationService") {
  static readonly Live = Layer.effect(
    InstallationService,
    Effect.gen(function* makeInstallationService() {
      const crypto = yield* CredentialCrypto;
      const requests = yield* VerisureRequests;
      const repository = yield* CredentialRepository;

      const list = Effect.gen(function* () {
        const credentialRow = yield* CurrentCredential;
        const credential = yield* crypto.decryptCredential(credentialRow);
        return yield* requests.fetchAllInstallations({
          email: Redacted.value(credential.email),
        });
      });

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
            return yield* new ServiceError({
              message:
                "Credential not found while setting default installation",
            });
          }
          const email = yield* crypto.decryptString(
            updated.value.encryptedEmail
          );
          return credentialSummary(updated.value, email);
        });

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
