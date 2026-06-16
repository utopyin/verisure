import type {
  AccountRow,
  ApiTokenInsert,
  ApiTokenRow,
  SessionRow,
  ShortcutExportRow,
  UserRow,
  VerificationRow,
  VerisureCredentialRow,
} from "@verisure/db/schema";
import type { ConnectionStatus, ShortcutTemplate } from "@verisure/domain";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const NullableDate = Schema.NullOr(Schema.Date);
const NullableString = Schema.NullOr(Schema.String);

export const ConnectionStatusSchema = Schema.Literals([
  "unchecked",
  "connected",
  "mfa_required",
  "auth_failed",
  "rate_limited",
  "error",
]) satisfies Schema.Schema<ConnectionStatus>;

export const ShortcutTemplateSchema = Schema.Literals([
  "toggle-full",
  "choose-mode",
]) satisfies Schema.Schema<ShortcutTemplate>;

export const UserRowSchema = Schema.Struct({
  createdAt: Schema.Date,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  id: Schema.String,
  image: NullableString,
  name: Schema.String,
  updatedAt: Schema.Date,
}) satisfies Schema.Schema<UserRow>;

export const SessionRowSchema = Schema.Struct({
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
  id: Schema.String,
  ipAddress: NullableString,
  token: Schema.String,
  updatedAt: Schema.Date,
  userAgent: NullableString,
  userId: Schema.String,
}) satisfies Schema.Schema<SessionRow>;

export const AccountRowSchema = Schema.Struct({
  accessToken: NullableString,
  accessTokenExpiresAt: NullableDate,
  accountId: Schema.String,
  createdAt: Schema.Date,
  id: Schema.String,
  idToken: NullableString,
  password: NullableString,
  providerId: Schema.String,
  refreshToken: NullableString,
  refreshTokenExpiresAt: NullableDate,
  scope: NullableString,
  updatedAt: Schema.Date,
  userId: Schema.String,
}) satisfies Schema.Schema<AccountRow>;

export const VerificationRowSchema = Schema.Struct({
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
  id: Schema.String,
  identifier: Schema.String,
  updatedAt: Schema.Date,
  value: Schema.String,
}) satisfies Schema.Schema<VerificationRow>;

export const VerisureCredentialRowSchema = Schema.Struct({
  alias: Schema.String,
  connectedAt: NullableDate,
  connectionStatus: ConnectionStatusSchema,
  connectionStatusMessage: NullableString,
  createdAt: Schema.Date,
  defaultGiid: NullableString,
  encryptedEmail: Schema.String,
  encryptedPassword: Schema.String,
  encryptedPin: NullableString,
  id: Schema.String,
  lastConnectionAttemptAt: NullableDate,
  mfaRequestedAt: NullableDate,
  updatedAt: Schema.Date,
  userId: Schema.String,
}) satisfies Schema.Schema<VerisureCredentialRow>;

export const ApiTokenRowSchema = Schema.Struct({
  allowedGiidsJson: NullableString,
  createdAt: Schema.Date,
  credentialId: Schema.String,
  displayPrefix: Schema.String,
  expiresAt: NullableDate,
  id: Schema.String,
  lastUsedAt: NullableDate,
  revokedAt: NullableDate,
  scopesJson: Schema.String,
  tokenHash: Schema.String,
  updatedAt: Schema.Date,
  userId: Schema.String,
}) satisfies Schema.Schema<ApiTokenRow>;

export const ShortcutExportRowSchema = Schema.Struct({
  apiTokenId: Schema.String,
  createdAt: Schema.Date,
  credentialId: Schema.String,
  downloadNonceHash: NullableString,
  id: Schema.String,
  template: ShortcutTemplateSchema,
  userId: Schema.String,
}) satisfies Schema.Schema<ShortcutExportRow>;

export const decodeUserRow = Schema.decodeEffect(UserRowSchema);
export const decodeSessionRow = Schema.decodeEffect(SessionRowSchema);
export const decodeAccountRow = Schema.decodeEffect(AccountRowSchema);
export const decodeVerificationRow = Schema.decodeEffect(VerificationRowSchema);
export const decodeVerisureCredentialRow = Schema.decodeEffect(
  VerisureCredentialRowSchema
);
export const decodeShortcutExportRow = Schema.decodeEffect(
  ShortcutExportRowSchema
);

export const StringArrayJsonSchema = Schema.fromJsonString(
  Schema.Array(Schema.String)
);

export interface ApiTokenRecord extends Omit<
  ApiTokenRow,
  "scopesJson" | "allowedGiidsJson"
> {
  readonly scopes: readonly string[];
  readonly allowedGiids?: readonly string[];
}

export const ApiTokenRecordSchema = Schema.Struct({
  allowedGiids: Schema.optionalKey(Schema.Array(Schema.String)),
  createdAt: Schema.Date,
  credentialId: Schema.String,
  displayPrefix: Schema.String,
  expiresAt: NullableDate,
  id: Schema.String,
  lastUsedAt: NullableDate,
  revokedAt: NullableDate,
  scopes: Schema.Array(Schema.String),
  tokenHash: Schema.String,
  updatedAt: Schema.Date,
  userId: Schema.String,
}) satisfies Schema.Schema<ApiTokenRecord>;

export const encodeStringArrayJson = Schema.encodeEffect(StringArrayJsonSchema);
export const decodeStringArrayJson = Schema.decodeEffect(StringArrayJsonSchema);

export interface ApiTokenJsonFieldsInput {
  readonly scopes: readonly string[];
  readonly allowedGiids?: readonly string[];
}

export type EncodedApiTokenJsonFields = Pick<
  ApiTokenInsert,
  "scopesJson" | "allowedGiidsJson"
>;

export const encodeApiTokenJsonFields = (
  input: ApiTokenJsonFieldsInput
): Effect.Effect<EncodedApiTokenJsonFields, Schema.SchemaError> =>
  Effect.gen(function* () {
    const scopesJson = yield* encodeStringArrayJson(input.scopes);
    const allowedGiidsJson =
      input.allowedGiids === undefined
        ? null
        : yield* encodeStringArrayJson(input.allowedGiids);
    return { allowedGiidsJson, scopesJson };
  });

export const decodeApiTokenRow = (
  row: ApiTokenRow
): Effect.Effect<ApiTokenRecord, Schema.SchemaError> =>
  Effect.gen(function* () {
    const validRow = yield* Schema.decodeEffect(ApiTokenRowSchema)(row);
    const scopes = yield* decodeStringArrayJson(validRow.scopesJson);
    const allowedGiids =
      validRow.allowedGiidsJson === null
        ? undefined
        : yield* decodeStringArrayJson(validRow.allowedGiidsJson);

    return yield* Schema.decodeUnknownEffect(ApiTokenRecordSchema)({
      createdAt: validRow.createdAt,
      credentialId: validRow.credentialId,
      displayPrefix: validRow.displayPrefix,
      expiresAt: validRow.expiresAt,
      id: validRow.id,
      lastUsedAt: validRow.lastUsedAt,
      revokedAt: validRow.revokedAt,
      scopes,
      ...(allowedGiids === undefined ? {} : { allowedGiids }),
      tokenHash: validRow.tokenHash,
      updatedAt: validRow.updatedAt,
      userId: validRow.userId,
    });
  });
