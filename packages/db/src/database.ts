import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Drizzle from "./drizzle.ts";
import { tables, type Schema } from "./schema.ts";

export type DrizzleDatabase = Drizzle.EffectDrizzleDatabase<Schema>;

export class Database extends Context.Service<Database, DrizzleDatabase>()(
  "@verisure/db/Database",
) {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* makeDatabase() {
      return yield* Drizzle.make({ schema: tables });
    }),
  );
}
