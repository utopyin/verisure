import type { VerisureCredentialRow } from "@verisure/db/schema";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface CurrentUserShape {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
}

export interface CurrentInstallationShape {
  readonly giid: string;
}

/**
 * Authenticated user for the current request/RPC execution.
 *
 * @effect-leakable-service
 */
export class CurrentUser extends Context.Service<
  CurrentUser,
  CurrentUserShape
>()("@verisure/server/CurrentUser") {}

/**
 * Credential selected and authorized for the current request/RPC execution.
 *
 * @effect-leakable-service
 */
export class CurrentCredential extends Context.Service<
  CurrentCredential,
  VerisureCredentialRow
>()("@verisure/server/CurrentCredential") {}

/**
 * Installation selected and authorized for the current request/RPC execution.
 *
 * @effect-leakable-service
 */
export class CurrentInstallation extends Context.Service<
  CurrentInstallation,
  CurrentInstallationShape
>()("@verisure/server/CurrentInstallation") {}

export class ScopeError extends Schema.TaggedErrorClass<ScopeError>()(
  "ScopeError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    credentialId: Schema.optionalKey(Schema.String),
    giid: Schema.optionalKey(Schema.String),
    message: Schema.String,
  }
) {}

export const provideCurrentUser = <A, E, R>(
  user: CurrentUserShape,
  effect: Effect.Effect<A, E, R | CurrentUser>
): Effect.Effect<A, E, R> => Effect.provideService(effect, CurrentUser, user);

export const provideCurrentInstallation = <A, E, R>(
  giid: string,
  effect: Effect.Effect<A, E, R | CurrentInstallation>
): Effect.Effect<A, E, R> =>
  Effect.provideService(effect, CurrentInstallation, { giid });
