import * as Schema from "effect/Schema";

export class ServiceError extends Schema.TaggedErrorClass<ServiceError>()(
  "ServiceError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}
