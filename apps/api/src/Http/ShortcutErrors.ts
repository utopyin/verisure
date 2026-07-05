import * as Schema from "effect/Schema";

export class ShortcutMfaRequired extends Schema.TaggedErrorClass<ShortcutMfaRequired>()(
  "ShortcutMfaRequired",
  { message: Schema.String },
  { httpApiStatus: 409 }
) {}
