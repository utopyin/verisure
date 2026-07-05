import * as Schema from "effect/Schema";

export class RepositoryError extends Schema.TaggedErrorClass<RepositoryError>()(
  "RepositoryError",
  { cause: Schema.Defect() }
) {}
