import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Drizzle from "./drizzle.ts";
import { relations, tables } from "./schema.ts";
import type { Relations, Schema } from "./schema.ts";

export type DrizzleDatabase = Drizzle.EffectDrizzleDatabase<Schema, Relations>;

export class Database extends Context.Service<Database, DrizzleDatabase>()(
  "@verisure/db/Database"
) {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* makeDatabase() {
      return yield* Drizzle.make({ relations, schema: tables });
    })
  );
}
