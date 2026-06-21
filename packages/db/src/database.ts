import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import * as Drizzle from "./drizzle";
import { relations, tables } from "./schema";
import type { Relations, Schema } from "./schema";

export type DrizzleDatabase = Drizzle.EffectDrizzleDatabase<Schema, Relations>;

export class Database extends Context.Service<Database, DrizzleDatabase>()(
  "@verisure/db/Database"
) {
  static readonly layer = Layer.effect(
    Database,
    Drizzle.make({ relations, schema: tables })
  );
}
