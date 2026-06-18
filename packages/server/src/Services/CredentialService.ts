import type { VerisureCredentialRow } from "@verisure/db/schema";
import type {
  CredentialSummary,
  InstallationSummary,
  MfaRequestResult,
  MfaValidationResult,
} from "@verisure/domain";
import * as Context from "effect/Context";
import { Crypto } from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { PlatformError } from "effect/PlatformError";
import * as Redacted from "effect/Redacted";

import { CredentialRepository } from "../Repositories/CredentialRepository.ts";
import type { RepositoryError } from "../Repositories/RepositoryError.ts";
import { CredentialCrypto } from "../Security/CredentialCrypto.ts";
import type { CredentialCryptoError } from "../Security/CredentialCrypto.ts";
import {
  CurrentCredential,
  CurrentUser,
  ScopeError,
} from "../Security/RequestContext.ts";
import { VerisureAuth } from "../Verisure/VerisureAuth.ts";
import type { VerisureAuthError } from "../Verisure/VerisureAuth.ts";
import type { VerisureGraphQLError } from "../Verisure/VerisureGraphQL.ts";
import { VerisureGraphQLClient } from "../Verisure/VerisureGraphQLClient.ts";
import type { ServiceError } from "./ServiceError.ts";

export type CredentialServiceError =
  | CredentialCryptoError
  | PlatformError
  | RepositoryError
  | ScopeError
  | ServiceError
  | VerisureAuthError
  | VerisureGraphQLError;

export interface CreateVerisureCredentialInput {
  readonly alias: string;
  readonly email: string;
  readonly password: string;
  readonly pin?: string | null;
}

export interface CredentialServiceShape {
  readonly list: Effect.Effect<
    readonly CredentialSummary[],
    CredentialServiceError,
    CurrentUser
  >;
  readonly create: (
    input: CreateVerisureCredentialInput
  ) => Effect.Effect<CredentialSummary, CredentialServiceError, CurrentUser>;
  readonly delete: (
    credentialId: string
  ) => Effect.Effect<void, CredentialServiceError, CurrentUser>;
  readonly checkConnection: (
    credentialId: string
  ) => Effect.Effect<
    readonly InstallationSummary[],
    CredentialServiceError,
    CurrentUser
  >;
  readonly requestMfa: (
    credentialId: string
  ) => Effect.Effect<MfaRequestResult, CredentialServiceError, CurrentUser>;
  readonly validateMfa: (input: {
    readonly credentialId: string;
    readonly code: string;
  }) => Effect.Effect<MfaValidationResult, CredentialServiceError, CurrentUser>;
  readonly logout: (
    credentialId: string
  ) => Effect.Effect<void, CredentialServiceError, CurrentUser>;
}

export class CredentialService extends Context.Service<
  CredentialService,
  CredentialServiceShape
>()("@verisure/server/CredentialService") {
  static readonly Live = Layer.effect(
    CredentialService,
    Effect.gen(function* makeCredentialService() {
      const auth = yield* VerisureAuth;
      const crypto = yield* CredentialCrypto;
      const platformCrypto = yield* Crypto;
      const graphql = yield* VerisureGraphQLClient;
      const repository = yield* CredentialRepository;

      const summarize = (row: VerisureCredentialRow) =>
        crypto
          .decryptString(row.encryptedEmail)
          .pipe(Effect.map((email) => credentialSummary(row, email)));

      const list = Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* repository.listForUser(user.id);
        return yield* Effect.forEach(rows, summarize);
      });

      const create: CredentialServiceShape["create"] = (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const encrypted = yield* crypto.encryptCredential(input);
          const now = new Date();
          const row = yield* repository.create({
            alias: input.alias,
            encryptedEmail: encrypted.encryptedEmail,
            encryptedPassword: encrypted.encryptedPassword,
            encryptedPin: encrypted.encryptedPin,
            id: yield* platformCrypto.randomUUIDv4,
            now,
            userId: user.id,
          });
          return credentialSummary(row, input.email);
        });

      const deleteCredential: CredentialServiceShape["delete"] = (
        credentialId
      ) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* repository.delete({ id: credentialId, userId: user.id });
        });

      const listScopedInstallations = Effect.gen(function* () {
        yield* auth.ensureSession;
        const credentialRow = yield* CurrentCredential;
        const credential = yield* crypto.decryptCredential(credentialRow);
        return yield* graphql.fetchAllInstallations({
          email: Redacted.value(credential.email),
        });
      });

      const withCredential =
        (credentialId: string) =>
        <A, E>(
          effect: Effect.Effect<A, E, CurrentCredential>
        ): Effect.Effect<A, E | RepositoryError | ScopeError, CurrentUser> =>
          Effect.gen(function* () {
            const user = yield* CurrentUser;
            const credential = yield* repository.getOwnedById({
              id: credentialId,
              userId: user.id,
            });
            if (Option.isNone(credential)) {
              return yield* new ScopeError({
                credentialId,
                message: "Credential not found or not owned by current user",
              });
            }
            return yield* effect.pipe(
              Effect.provideService(CurrentCredential, credential.value)
            );
          });

      const checkConnection: CredentialServiceShape["checkConnection"] = (
        credentialId
      ) => listScopedInstallations.pipe(withCredential(credentialId));

      const requestMfa: CredentialServiceShape["requestMfa"] = (credentialId) =>
        auth.requestMfa.pipe(
          Effect.as({ credentialId, status: "mfa_requested" as const }),
          withCredential(credentialId)
        );

      const validateMfa: CredentialServiceShape["validateMfa"] = (input) =>
        Effect.gen(function* () {
          yield* auth.validateMfa(input.code);
          const installations = yield* listScopedInstallations;
          const current = yield* CurrentCredential;
          const credential = yield* summarize(current);
          return { credential, installations };
        }).pipe(withCredential(input.credentialId));

      const logout: CredentialServiceShape["logout"] = (credentialId) =>
        auth.logout.pipe(withCredential(credentialId));

      return CredentialService.of({
        checkConnection,
        create,
        delete: deleteCredential,
        list,
        logout,
        requestMfa,
        validateMfa,
      });
    })
  );
}

const credentialSummary = (
  row: VerisureCredentialRow,
  email: string
): CredentialSummary => ({
  alias: row.alias,
  connectionStatus: row.connectionStatus,
  createdAt: row.createdAt.toISOString(),
  ...(row.defaultGiid === null ? {} : { defaultGiid: row.defaultGiid }),
  email,
  id: row.id,
  updatedAt: row.updatedAt.toISOString(),
});
