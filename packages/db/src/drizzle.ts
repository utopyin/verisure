import type { DrizzleConfig } from "drizzle-orm";
import { QueryPromise } from "drizzle-orm/query-promise";
import { SQLiteSelectBase } from "drizzle-orm/sqlite-core";
import type { AsyncRemoteCallback, SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Effectable from "effect/Effectable";
import type * as Fiber from "effect/Fiber";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlError, UnknownError } from "effect/unstable/sql/SqlError";

export type EffectDrizzleDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = SqliteRemoteDatabase<TSchema>;

let currentContext: Context.Context<never> | undefined;

const queryPromiseEffectPrototype = Effectable.Prototype<
  Effect.Effect<unknown, SqlError, SqlClient.SqlClient>
>({
  label: "DrizzleQuery",
  evaluate(this: Effect.Effect<unknown, SqlError, SqlClient.SqlClient>, fiber: Fiber.Fiber<unknown, unknown>) {
    return Effect.tryPromise({
      try: async () => {
        const previous = currentContext;
        currentContext = fiber.context;
        try {
          return await (this as unknown as QueryPromise<unknown>).execute();
        } finally {
          currentContext = previous;
        }
      },
      catch: (cause) => toSqlError(cause, "Failed to execute Drizzle query"),
    });
  },
});

const patchQueryPromise = (prototype: object) => {
  if ("pipe" in prototype) {
    return;
  }
  Object.assign(prototype, queryPromiseEffectPrototype);
};

patchQueryPromise(QueryPromise.prototype);
patchQueryPromise(SQLiteSelectBase.prototype);

const toSqlError = (cause: unknown, message: string) =>
  new SqlError({
    reason: new UnknownError({
      cause,
      message,
      operation: "drizzle",
    }),
  });

const makeRemoteCallback: Effect.Effect<AsyncRemoteCallback, never, SqlClient.SqlClient> =
  Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient;
    const constructionContext = yield* Effect.context<never>();

    return (sql, params, method) => {
      const statement = client.unsafe(sql, params);
      const context = currentContext ?? constructionContext;
      const run = <A>(effect: Effect.Effect<A, SqlError>) =>
        Effect.runPromiseWith(context)(effect);

      if (method === "run") {
        return run(Effect.map(statement.raw, (header) => ({ rows: [header] })));
      }

      const rows = method === "all" || method === "values"
        ? statement.values
        : statement.withoutTransform;

      return run(
        Effect.map(rows, (rows) => ({
          rows: method === "get"
            ? (rows[0] ?? []) as Array<unknown>
            : rows as Array<unknown>,
        })),
      );
    };
  });

export const make = <
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  config?: Omit<DrizzleConfig<TSchema>, "logger">,
): Effect.Effect<EffectDrizzleDatabase<TSchema>, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    return drizzle(yield* makeRemoteCallback, config);
  });
