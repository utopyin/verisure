import * as Schema from "effect/Schema";

export class ShortcutUnauthorizedError extends Schema.TaggedErrorClass<ShortcutUnauthorizedError>()(
  "ShortcutUnauthorizedError",
  { message: Schema.String },
  { httpApiStatus: 401 }
) {}

export class ShortcutForbiddenError extends Schema.TaggedErrorClass<ShortcutForbiddenError>()(
  "ShortcutForbiddenError",
  { message: Schema.String },
  { httpApiStatus: 403 }
) {}

export class ShortcutInvalidInputError extends Schema.TaggedErrorClass<ShortcutInvalidInputError>()(
  "ShortcutInvalidInputError",
  { message: Schema.String },
  { httpApiStatus: 400 }
) {}

export class ShortcutInstallationNotFoundError extends Schema.TaggedErrorClass<ShortcutInstallationNotFoundError>()(
  "ShortcutInstallationNotFoundError",
  { giid: Schema.String, message: Schema.String },
  { httpApiStatus: 404 }
) {}

export class ShortcutMfaRequiredError extends Schema.TaggedErrorClass<ShortcutMfaRequiredError>()(
  "ShortcutMfaRequiredError",
  { message: Schema.String },
  { httpApiStatus: 409 }
) {}

export class ShortcutRateLimitError extends Schema.TaggedErrorClass<ShortcutRateLimitError>()(
  "ShortcutRateLimitError",
  { message: Schema.String },
  { httpApiStatus: 429 }
) {}

export class ShortcutVerisureUpstreamError extends Schema.TaggedErrorClass<ShortcutVerisureUpstreamError>()(
  "ShortcutVerisureUpstreamError",
  { message: Schema.String },
  { httpApiStatus: 502 }
) {}

export class ShortcutServiceUnavailableError extends Schema.TaggedErrorClass<ShortcutServiceUnavailableError>()(
  "ShortcutServiceUnavailableError",
  { message: Schema.String },
  { httpApiStatus: 503 }
) {}

export const ShortcutRestErrorSchemas = [
  ShortcutUnauthorizedError,
  ShortcutForbiddenError,
  ShortcutInvalidInputError,
  ShortcutInstallationNotFoundError,
  ShortcutMfaRequiredError,
  ShortcutRateLimitError,
  ShortcutVerisureUpstreamError,
  ShortcutServiceUnavailableError,
] as const;
