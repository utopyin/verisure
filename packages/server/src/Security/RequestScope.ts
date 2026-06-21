import type { InstallationSummary } from "@verisure/domain";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { CredentialRepository } from "../Repositories/CredentialRepository";
import type { RepositoryError } from "../Repositories/RepositoryError";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import type { VerisureRequestsError } from "../Verisure/VerisureRequests";
import { CredentialCrypto } from "./CredentialCrypto";
import type { CredentialCryptoError } from "./CredentialCrypto";
import {
  CurrentInstallation,
  CurrentCredential,
  CurrentUser,
  ScopeError,
} from "./RequestContext";

export const provideCredentialScope =
  (credentialId: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | ScopeError | RepositoryError,
    Exclude<R, CurrentCredential> | CurrentUser | CredentialRepository
  > =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      const credentials = yield* CredentialRepository;
      const credential = yield* credentials.getOwnedById({
        id: credentialId,
        userId: user.id,
      });

      if (Option.isNone(credential)) {
        return yield* new ScopeError({
          credentialId,
          message: "Credential not found or not owned by current user",
        });
      }

      return yield* Effect.provideService(
        effect,
        CurrentCredential,
        credential.value
      );
    });

export const provideInstallationScope =
  (giid: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | CredentialCryptoError | ScopeError | VerisureRequestsError,
    | Exclude<R, CurrentInstallation>
    | CredentialCrypto
    | CurrentCredential
    | VerisureRequests
  > =>
    Effect.gen(function* () {
      yield* verifyInstallationMembership(giid);
      return yield* effect.pipe(
        Effect.provideService(CurrentInstallation, {
          giid,
        })
      );
    });

export const provideDefaultInstallationScope = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  E | CredentialCryptoError | ScopeError | VerisureRequestsError,
  | Exclude<R, CurrentInstallation>
  | CredentialCrypto
  | CurrentCredential
  | VerisureRequests
> =>
  Effect.gen(function* () {
    const credential = yield* CurrentCredential;
    if (credential.defaultGiid === null) {
      return yield* new ScopeError({
        credentialId: credential.id,
        message: "Credential has no default installation",
      });
    }
    return yield* effect.pipe(provideInstallationScope(credential.defaultGiid));
  });

const verifyInstallationMembership = (giid: string) =>
  Effect.gen(function* () {
    const installations = yield* listCurrentCredentialInstallations;
    if (installations.some((installation) => installation.giid === giid)) {
      return;
    }

    const credential = yield* CurrentCredential;
    return yield* new ScopeError({
      credentialId: credential.id,
      giid,
      message: "Installation not found or not owned by current credential",
    });
  });

const listCurrentCredentialInstallations: Effect.Effect<
  readonly InstallationSummary[],
  CredentialCryptoError | VerisureRequestsError,
  CredentialCrypto | CurrentCredential | VerisureRequests
> = Effect.gen(function* () {
  const credentialRow = yield* CurrentCredential;
  const crypto = yield* CredentialCrypto;
  const requests = yield* VerisureRequests;
  const credential = yield* crypto.decryptCredential(credentialRow);
  return yield* requests.fetchAllInstallations({
    email: Redacted.value(credential.email),
  });
});
