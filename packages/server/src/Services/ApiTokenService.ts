import type { VerisureCredentialRow } from "@verisure/db/schema";
import type { ApiTokenRecord } from "@verisure/interface";
import * as Context from "effect/Context";
import { Crypto } from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { ApiTokenRepository } from "../Repositories/ApiTokenRepository";
import { CredentialRepository } from "../Repositories/CredentialRepository";
import { UserRepository } from "../Repositories/UserRepository";
import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import type { CurrentUserShape } from "../Security/RequestContext";
import { CurrentUser } from "../Security/RequestContext";
import {
  ApiTokenForbidden,
  ApiTokenNotFound,
  ApiTokenUnauthorized,
  CredentialNotFound,
  ServiceUnavailable,
} from "./ServiceError";

export const ShortcutAlarmReadScope = "shortcut:alarm:read" as const;
export const ShortcutAlarmWriteScope = "shortcut:alarm:write" as const;
export const ShortcutAlarmScopes = [
  ShortcutAlarmReadScope,
  ShortcutAlarmWriteScope,
] as const;

export interface CreateApiTokenCommand {
  readonly credentialId: string;
  readonly scopes: readonly string[];
  readonly allowedGiids?: readonly string[];
  readonly expiresAt?: Date | null;
}

export interface CreatedApiToken {
  readonly token: ApiTokenRecord;
  readonly plaintextToken: string;
}

export interface AuthenticatedApiToken {
  readonly credential: VerisureCredentialRow;
  readonly token: ApiTokenRecord;
  readonly user: CurrentUserShape;
}

export interface AuthenticateApiTokenCommand {
  readonly plaintextToken: string;
  readonly requiredScopes?: readonly string[];
  readonly giid?: string;
}

export interface ApiTokenServiceShape {
  readonly create: (
    command: CreateApiTokenCommand
  ) => Effect.Effect<
    CreatedApiToken,
    CredentialNotFound | ServiceUnavailable,
    CurrentUser
  >;
  readonly authenticate: (
    command: AuthenticateApiTokenCommand
  ) => Effect.Effect<
    AuthenticatedApiToken,
    ApiTokenForbidden | ApiTokenUnauthorized | ServiceUnavailable
  >;
  readonly list: (input: {
    readonly credentialId?: string;
  }) => Effect.Effect<
    readonly ApiTokenRecord[],
    ServiceUnavailable,
    CurrentUser
  >;
  readonly revoke: (input: {
    readonly tokenId: string;
  }) => Effect.Effect<void, ApiTokenNotFound | ServiceUnavailable, CurrentUser>;
  readonly hashPlaintextToken: (
    plaintextToken: string
  ) => Effect.Effect<string, ServiceUnavailable>;
}

export class ApiTokenService extends Context.Service<
  ApiTokenService,
  ApiTokenServiceShape
>()("@verisure/server/ApiTokenService") {
  static readonly Test = (
    options: {
      readonly tokens?: readonly ApiTokenRecord[];
    } = {}
  ) =>
    Layer.succeed(
      ApiTokenService,
      ApiTokenService.of({
        authenticate: () =>
          Effect.fail(
            new ApiTokenUnauthorized({ message: "authenticate not stubbed" })
          ),
        create: () =>
          Effect.fail(
            new ServiceUnavailable({ message: "create not stubbed" })
          ),
        hashPlaintextToken: () =>
          Effect.fail(
            new ServiceUnavailable({
              message: "hashPlaintextToken not stubbed",
            })
          ),
        list: () => Effect.succeed(options.tokens ?? []),
        revoke: () => Effect.void,
      })
    );

  static readonly Live = Layer.effect(
    ApiTokenService,
    Effect.gen(function* () {
      const config = yield* RuntimeConfig;
      const platformCrypto = yield* Crypto;
      const tokens = yield* ApiTokenRepository;
      const credentials = yield* CredentialRepository;
      const users = yield* UserRepository;

      const hashPlaintextToken: ApiTokenServiceShape["hashPlaintextToken"] =
        Effect.fn("ApiTokenService.hashPlaintextToken")((plaintextToken) =>
          hashToken(
            plaintextToken,
            Option.match(config.tokenPepper, {
              onNone: () => "",
              onSome: Redacted.value,
            })
          ).pipe(Effect.provideService(Crypto, platformCrypto))
        );

      const create: ApiTokenServiceShape["create"] = (command) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const credential = yield* credentials.getOwnedById({
            id: command.credentialId,
            userId: user.id,
          });
          if (Option.isNone(credential)) {
            return yield* new CredentialNotFound({
              credentialId: command.credentialId,
              message: "Credential not found",
            });
          }

          const bytes = yield* platformCrypto.randomBytes(32).pipe(
            Effect.mapError(
              (cause) =>
                new ServiceUnavailable({
                  cause,
                  message: "Failed to generate API token",
                })
            )
          );
          const plaintextToken = `vs_${bytesToBase64Url(bytes)}`;
          const tokenHash = yield* hashPlaintextToken(plaintextToken);
          const tokenId = yield* platformCrypto.randomUUIDv4.pipe(
            Effect.mapError(
              (cause) =>
                new ServiceUnavailable({
                  cause,
                  message: "Failed to generate API token id",
                })
            )
          );
          const now = new Date();
          const token = yield* tokens.create({
            allowedGiids: command.allowedGiids,
            credentialId: command.credentialId,
            displayPrefix: `${plaintextToken.slice(0, 10)}…`,
            expiresAt: command.expiresAt ?? null,
            id: tokenId,
            now,
            scopes: command.scopes,
            tokenHash,
            userId: user.id,
          });

          return { plaintextToken, token };
        }).pipe(
          Effect.catchTag("RepositoryError", (cause) =>
            Effect.fail(
              new ServiceUnavailable({
                cause,
                message: "Unable to create API token",
              })
            )
          )
        );

      const authenticate: ApiTokenServiceShape["authenticate"] = (command) =>
        Effect.gen(function* () {
          const tokenHash = yield* hashPlaintextToken(command.plaintextToken);
          const token = yield* tokens.findUsableByHash({
            now: new Date(),
            tokenHash,
          });
          if (Option.isNone(token)) {
            return yield* new ApiTokenUnauthorized({
              message: "Invalid API token",
            });
          }

          const tokenRecord = token.value;
          const missingScope = (command.requiredScopes ?? []).find(
            (scope) => !tokenRecord.scopes.includes(scope)
          );
          if (missingScope !== undefined) {
            return yield* new ApiTokenForbidden({
              message: `API token is missing required scope: ${missingScope}`,
            });
          }

          if (
            command.giid !== undefined &&
            tokenRecord.allowedGiids !== undefined &&
            !tokenRecord.allowedGiids.includes(command.giid)
          ) {
            return yield* new ApiTokenForbidden({
              message: "API token is not allowed to access this installation",
            });
          }

          const credential = yield* credentials.getOwnedById({
            id: tokenRecord.credentialId,
            userId: tokenRecord.userId,
          });
          if (Option.isNone(credential)) {
            return yield* new ApiTokenUnauthorized({
              message: "API token credential no longer exists",
            });
          }

          const tokenUser = yield* users.getById(tokenRecord.userId);
          if (Option.isNone(tokenUser)) {
            return yield* new ApiTokenUnauthorized({
              message: "API token user no longer exists",
            });
          }

          const usedToken = yield* tokens.markUsed({
            id: tokenRecord.id,
            usedAt: new Date(),
          });
          const finalToken = Option.getOrElse(usedToken, () => tokenRecord);

          return {
            credential: credential.value,
            token: finalToken,
            user: {
              email: tokenUser.value.email,
              id: tokenUser.value.id,
              name: tokenUser.value.name,
            },
          };
        }).pipe(
          Effect.catchTag("RepositoryError", (cause) =>
            Effect.fail(
              new ServiceUnavailable({
                cause,
                message: "Unable to authenticate API token",
              })
            )
          )
        );

      const list: ApiTokenServiceShape["list"] = (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return input.credentialId === undefined
            ? yield* tokens.listForUser(user.id)
            : yield* tokens.listForCredential({
                credentialId: input.credentialId,
                userId: user.id,
              });
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ServiceUnavailable({
                cause,
                message: "Unable to list API tokens",
              })
          )
        );

      const revoke: ApiTokenServiceShape["revoke"] = (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const revoked = yield* tokens.revoke({
            id: input.tokenId,
            revokedAt: new Date(),
            userId: user.id,
          });
          if (Option.isNone(revoked)) {
            return yield* new ApiTokenNotFound({
              message: "API token not found",
            });
          }
        }).pipe(
          Effect.catchTag("RepositoryError", (cause) =>
            Effect.fail(
              new ServiceUnavailable({
                cause,
                message: "Unable to revoke API token",
              })
            )
          )
        );

      return ApiTokenService.of({
        authenticate,
        create,
        hashPlaintextToken,
        list,
        revoke,
      });
    })
  );
}

const hashToken = (
  plaintextToken: string,
  pepper: string
): Effect.Effect<string, ServiceUnavailable, Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto;
    const digest = yield* crypto
      .digest(
        "SHA-256",
        new TextEncoder().encode(`${pepper}:${plaintextToken}`)
      )
      .pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Failed to hash API token",
            })
        )
      );
    return bytesToBase64Url(digest);
  });

const bytesToBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
