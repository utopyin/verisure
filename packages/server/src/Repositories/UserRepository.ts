import { Database } from "@verisure/db";
import type { UserRow } from "@verisure/db/schema";
import { decodeUserRow } from "@verisure/interface";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { RepositoryError } from "./RepositoryError";

export interface UserRepositoryShape {
  readonly getById: (
    id: string
  ) => Effect.Effect<Option.Option<UserRow>, RepositoryError>;
}

export class UserRepository extends Context.Service<
  UserRepository,
  UserRepositoryShape
>()("@verisure/server/UserRepository") {
  static readonly Test = (users: readonly UserRow[]) =>
    Layer.succeed(
      UserRepository,
      UserRepository.of({
        getById: (id) =>
          Effect.succeed(
            Option.fromNullishOr(users.find((user) => user.id === id))
          ),
      })
    );

  static readonly Default = Layer.effect(
    UserRepository,
    Effect.gen(function* () {
      const db = yield* Database;

      const getById: UserRepositoryShape["getById"] = Effect.fn(
        "UserRepository.getById"
      )((id) =>
        db.query.user.findFirst({ where: { id } }).pipe(
          Effect.mapError((cause) => new RepositoryError({ cause })),
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((option) =>
            Option.match(option, {
              onNone: () => Effect.succeed(Option.none<UserRow>()),
              onSome: (row) =>
                decodeUserRow(row).pipe(
                  Effect.mapError((cause) => new RepositoryError({ cause })),
                  Effect.map(Option.some)
                ),
            })
          )
        )
      );

      return UserRepository.of({ getById });
    })
  );
}
