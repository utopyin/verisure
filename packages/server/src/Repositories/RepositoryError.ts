import * as Data from "effect/Data";

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown;
}> {}
