import * as Data from "effect/Data";

export class ServiceError extends Data.TaggedError("ServiceError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
