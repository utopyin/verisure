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
import type { PlatformError } from "effect/PlatformError";
import * as Redacted from "effect/Redacted";

import { CredentialRepository } from "../Repositories/CredentialRepository";
import type { RepositoryError } from "../Repositories/RepositoryError";
import { CredentialCrypto } from "../Security/CredentialCrypto";
import type { CredentialCryptoError } from "../Security/CredentialCrypto";
import { CurrentCredential, CurrentUser } from "../Security/RequestContext";
import { VerisureAuth } from "../Verisure/VerisureAuth";
import type { VerisureAuthError } from "../Verisure/VerisureAuth";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import type { VerisureRequestsError } from "../Verisure/VerisureRequests";
import type { ServiceError } from "./ServiceError";

export type CredentialServiceError =
  | CredentialCryptoError
  | PlatformError
  | RepositoryError
  | ServiceError
  | VerisureAuthError
  | VerisureRequestsError;

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
  readonly delete: Effect.Effect<
    void,
    CredentialServiceError,
    CurrentCredential
  >;
  readonly checkConnection: Effect.Effect<
    readonly InstallationSummary[],
    CredentialServiceError,
    CurrentCredential
  >;
  readonly requestMfa: Effect.Effect<
    MfaRequestResult,
    CredentialServiceError,
    CurrentCredential
  >;
  readonly validateMfa: (
    code: string
  ) => Effect.Effect<
    MfaValidationResult,
    CredentialServiceError,
    CurrentCredential
  >;
  readonly logout: Effect.Effect<
    void,
    CredentialServiceError,
    CurrentCredential
  >;
}

export class CredentialService extends Context.Service<
  CredentialService,
  CredentialServiceShape
>()("@verisure/server/CredentialService") {
  static readonly Live = Layer.effect(
    CredentialService,
    Effect.gen(function* () {
      const auth = yield* VerisureAuth;
      const crypto = yield* CredentialCrypto;
      const platformCrypto = yield* Crypto;
      const requests = yield* VerisureRequests;
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

      const deleteCredential = Effect.gen(function* () {
        const credential = yield* CurrentCredential;
        yield* repository.delete({
          id: credential.id,
          userId: credential.userId,
        });
      });

      const listScopedInstallations = Effect.gen(function* () {
        yield* auth.ensureSession;
        const credentialRow = yield* CurrentCredential;
        const credential = yield* crypto.decryptCredential(credentialRow);
        return yield* requests.fetchAllInstallations({
          email: Redacted.value(credential.email),
        });
      });

      const checkConnection = listScopedInstallations;

      const requestMfa = Effect.gen(function* () {
        const credential = yield* CurrentCredential;
        yield* auth.requestMfa;
        return {
          credentialId: credential.id,
          status: "mfa_requested" as const,
        };
      });

      const validateMfa: CredentialServiceShape["validateMfa"] = (code) =>
        Effect.gen(function* () {
          yield* auth.validateMfa(code);
          const installations = yield* listScopedInstallations;
          const current = yield* CurrentCredential;
          const credential = yield* summarize(current);
          return { credential, installations };
        });

      const { logout } = auth;

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
