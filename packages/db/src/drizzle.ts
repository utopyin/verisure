import type { AnyRelations, DrizzleConfig, EmptyRelations } from "drizzle-orm";
import type {
  BuildSubquerySelection,
  JoinNullability,
  SelectMode,
  SelectResult,
} from "drizzle-orm/query-builders/select.types";
import { QueryPromise } from "drizzle-orm/query-promise";
import type { ColumnsSelection } from "drizzle-orm/sql/sql";
import { SQLiteSelectBase } from "drizzle-orm/sqlite-core";
import type {
  AsyncRemoteCallback,
  SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Effectable from "effect/Effectable";
import type * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlError, UnknownError } from "effect/unstable/sql/SqlError";

export type EffectDrizzleDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TRelations extends AnyRelations = EmptyRelations,
> = SqliteRemoteDatabase<TSchema, TRelations>;

declare module "drizzle-orm/query-promise" {
  // oxlint-disable-next-line typescript/no-empty-interface
  interface QueryPromise<T> extends Effect.Effect<T, SqlError> {}
}

declare module "drizzle-orm/sqlite-core/query-builders/select" {
  // oxlint-disable-next-line typescript/no-empty-interface
  interface SQLiteSelectBase<
    TTableName extends string | undefined,
    TResultType extends "sync" | "async",
    TRunResult,
    TSelection extends ColumnsSelection,
    TSelectMode extends SelectMode = "single",
    TNullabilityMap extends Record<string, JoinNullability> =
      TTableName extends string ? Record<TTableName, "not-null"> : {},
    TDynamic extends boolean = false,
    TExcludedMethods extends string = never,
    // oxlint-disable-next-line typescript/no-explicit-any
    TResult extends any[] = SelectResult<
      TSelection,
      TSelectMode,
      TNullabilityMap
    >[],
    TSelectedFields extends ColumnsSelection = BuildSubquerySelection<
      TSelection,
      TNullabilityMap
    >,
  > extends Effect.Effect<TResult, SqlError> {}
}

let currentContext: Context.Context<never> | undefined;

const queryPromiseEffectPrototype = Effectable.Prototype<
  Effect.Effect<unknown, SqlError>
>({
  evaluate(
    this: Effect.Effect<unknown, SqlError>,
    fiber: Fiber.Fiber<unknown, unknown>
  ) {
    return Effect.tryPromise({
      catch: (cause) => toSqlError(cause, "Failed to execute Drizzle query"),
      try: async () => {
        const previous = currentContext;
        currentContext = fiber.context;
        try {
          return await (this as unknown as QueryPromise<unknown>).execute();
        } finally {
          currentContext = previous;
        }
      },
    });
  },
  label: "DrizzleQuery",
});

const patchQueryPromise = (prototype: object) => {
  if ("pipe" in prototype) {
    return;
  }
  void Object.assign(prototype, queryPromiseEffectPrototype);
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

const makeRemoteCallback: Effect.Effect<
  AsyncRemoteCallback,
  never,
  SqlClient.SqlClient
> = Effect.gen(function* makeRemoteCallback() {
  const client = yield* SqlClient.SqlClient;
  const constructionContext = yield* Effect.context<never>();

  return (sql, params, method) => {
    const statement = client.unsafe(sql, params);
    const context =
      currentContext !== undefined &&
      Option.isSome(Context.getOption(currentContext, SqlClient.SqlClient))
        ? currentContext
        : constructionContext;
    const run = <A>(effect: Effect.Effect<A, SqlError>) =>
      Effect.runPromiseWith(context)(effect);

    if (method === "run") {
      return run(Effect.map(statement.raw, (header) => ({ rows: [header] })));
    }

    const rows =
      method === "all" || method === "values"
        ? statement.values
        : statement.withoutTransform;

    return run(
      Effect.map(rows, (rows) => ({
        rows:
          method === "get"
            ? ((rows[0] ?? []) as unknown[])
            : (rows as unknown[]),
      }))
    );
  };
});

export const make = <
  TSchema extends Record<string, unknown> = Record<string, never>,
  TRelations extends AnyRelations = EmptyRelations,
>(
  config?: Omit<DrizzleConfig<TSchema, TRelations>, "logger">
): Effect.Effect<
  EffectDrizzleDatabase<TSchema, TRelations>,
  never,
  SqlClient.SqlClient
> =>
  Effect.gen(function* make() {
    return drizzle(yield* makeRemoteCallback, config);
  });
