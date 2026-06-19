import type { VerisureCredentialRow } from "@verisure/db/schema";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

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
