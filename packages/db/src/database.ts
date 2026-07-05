import * as SQLiteD1Drizzle from "drizzle-orm/effect-d1";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { relations } from "./schema";
import type { Relations } from "./schema";

export type DrizzleDatabase = SQLiteD1Drizzle.EffectSQLiteD1Database<Relations>;

export class Database extends Context.Service<Database, DrizzleDatabase>()(
  "@verisure/db/Database"
) {
  static readonly layer = Layer.effect(
    Database,
    SQLiteD1Drizzle.makeWithDefaults({ relations })
  );
}
