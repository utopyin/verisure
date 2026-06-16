import type { VerisureCredentialRow } from "@verisure/db/schema";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CredentialRepository } from "../Repositories/CredentialRepository.ts";
import type { RepositoryError } from "../Repositories/RepositoryError.ts";

export interface CurrentUserShape {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
}

export interface CurrentInstallationShape {
  readonly giid: string;
}

export class CurrentUser extends Context.Service<
  CurrentUser,
  CurrentUserShape
>()("@verisure/server/CurrentUser") {}

export class CurrentCredential extends Context.Service<
  CurrentCredential,
  VerisureCredentialRow
>()("@verisure/server/CurrentCredential") {}

export class CurrentInstallation extends Context.Service<
  CurrentInstallation,
  CurrentInstallationShape
>()("@verisure/server/CurrentInstallation") {}

export class ScopeError extends Data.TaggedError("ScopeError")<{
  readonly message: string;
  readonly credentialId?: string;
  readonly giid?: string;
  readonly cause?: unknown;
}> {}

export const provideCurrentUser = <A, E, R>(
  user: CurrentUserShape,
  effect: Effect.Effect<A, E, R | CurrentUser>
): Effect.Effect<A, E, R> => Effect.provideService(effect, CurrentUser, user);

export const provideCurrentInstallation = <A, E, R>(
  giid: string,
  effect: Effect.Effect<A, E, R | CurrentInstallation>
): Effect.Effect<A, E, R> =>
  Effect.provideService(effect, CurrentInstallation, { giid });

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
): Effect.Effect<A, E, R> => provideCurrentInstallation(giid, effect);
