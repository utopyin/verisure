import * as D1Client from "@effect/sql-d1/D1Client";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database } from "./database.ts";

const DrizzleSchema = Drizzle.Schema("AppSchema", {
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/drizzle",
  dialect: "sqlite",
});

export const D1Database = Effect.gen(function* D1Database() {
  const schema = yield* DrizzleSchema;

  return yield* Cloudflare.D1Database("AppDb", {
    migrationsDir: schema.out,
    migrationsTable: "drizzle_migrations",
  });
});

const D1SqlClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const database = yield* D1Database;
    const connect = yield* Cloudflare.D1Connection;
    const connection = yield* connect(database);
    const db = yield* connection.raw;

    return D1Client.layer({ db });
  }),
);

export const DatabaseLive = Database.layer.pipe(Layer.provide(D1SqlClientLive));
