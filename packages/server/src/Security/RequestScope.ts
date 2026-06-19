import type { InstallationSummary } from "@verisure/domain";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { CredentialRepository } from "../Repositories/CredentialRepository.ts";
import type { RepositoryError } from "../Repositories/RepositoryError.ts";
import { VerisureRequests } from "../Verisure/VerisureRequests.ts";
import type { VerisureRequestsError } from "../Verisure/VerisureRequests.ts";
import { CredentialCrypto } from "./CredentialCrypto.ts";
import type { CredentialCryptoError } from "./CredentialCrypto.ts";
import type { CurrentInstallation } from "./RequestContext.ts";
import {
  CurrentCredential,
  CurrentUser,
  ScopeError,
  provideCurrentInstallation,
} from "./RequestContext.ts";

export const provideCredentialScope = <A, E, R>(
  credentialId: string,
  effect: Effect.Effect<A, E, R | CurrentCredential>
): Effect.Effect<
  A,
  E | ScopeError | RepositoryError,
  R | CurrentUser | CredentialRepository
> =>
  Effect.gen(function* provideCredentialScope() {
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

export const provideInstallationScope = <A, E, R>(
  giid: string,
  effect: Effect.Effect<A, E, R | CurrentInstallation>
): Effect.Effect<
  A,
  E | CredentialCryptoError | ScopeError | VerisureRequestsError,
  R | CredentialCrypto | CurrentCredential | VerisureRequests
> =>
  Effect.gen(function* provideInstallationScope() {
    yield* verifyInstallationMembership(giid);
    return yield* provideCurrentInstallation(giid, effect);
  });

export const provideDefaultInstallationScope = <A, E, R>(
  effect: Effect.Effect<A, E, R | CurrentInstallation>
): Effect.Effect<
  A,
  E | CredentialCryptoError | ScopeError | VerisureRequestsError,
  R | CredentialCrypto | CurrentCredential | VerisureRequests
> =>
  Effect.gen(function* provideDefaultInstallationScope() {
    const credential = yield* CurrentCredential;
    if (credential.defaultGiid === null) {
      return yield* new ScopeError({
        credentialId: credential.id,
        message: "Credential has no default installation",
      });
    }
    return yield* provideInstallationScope(credential.defaultGiid, effect);
  });

const verifyInstallationMembership = (giid: string) =>
  Effect.gen(function* verifyInstallationMembership() {
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
> = Effect.gen(function* listCurrentCredentialInstallations() {
  const credentialRow = yield* CurrentCredential;
  const crypto = yield* CredentialCrypto;
  const requests = yield* VerisureRequests;
  const credential = yield* crypto.decryptCredential(credentialRow);
  return yield* requests.fetchAllInstallations({
    email: Redacted.value(credential.email),
  });
});
