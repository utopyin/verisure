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
import * as Redacted from "effect/Redacted";

import { CredentialRepository } from "../Repositories/CredentialRepository";
import { CredentialCrypto } from "../Security/CredentialCrypto";
import { CurrentCredential, CurrentUser } from "../Security/RequestContext";
import { VerisureAuth } from "../Verisure/VerisureAuth";
import { VerisureRequests } from "../Verisure/VerisureRequests";
import { ServiceUnavailable } from "./ServiceError";

export interface CreateVerisureCredentialInput {
  readonly alias: string;
  readonly email: string;
  readonly password: string;
  readonly pin?: string | null;
}

export interface CredentialServiceShape {
  readonly list: Effect.Effect<
    readonly CredentialSummary[],
    ServiceUnavailable,
    CurrentUser
  >;
  readonly create: (
    input: CreateVerisureCredentialInput
  ) => Effect.Effect<CredentialSummary, ServiceUnavailable, CurrentUser>;
  readonly delete: Effect.Effect<void, ServiceUnavailable, CurrentCredential>;
  readonly checkConnection: Effect.Effect<
    readonly InstallationSummary[],
    ServiceUnavailable,
    CurrentCredential
  >;
  readonly requestMfa: Effect.Effect<
    MfaRequestResult,
    ServiceUnavailable,
    CurrentCredential
  >;
  readonly validateMfa: (
    code: string
  ) => Effect.Effect<
    MfaValidationResult,
    ServiceUnavailable,
    CurrentCredential
  >;
  readonly logout: Effect.Effect<void, ServiceUnavailable, CurrentCredential>;
}

export class CredentialService extends Context.Service<
  CredentialService,
  CredentialServiceShape
>()("@verisure/server/CredentialService") {
  static readonly Test = (
    options: {
      readonly credential?: CredentialSummary;
      readonly installations?: readonly InstallationSummary[];
    } = {}
  ) =>
    Layer.succeed(
      CredentialService,
      CredentialService.of({
        checkConnection: Effect.succeed(options.installations ?? []),
        create: () =>
          Effect.succeed(
            options.credential ?? {
              alias: "Home",
              connectionStatus: "connected" as const,
              createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
              email: "user@example.com",
              id: "credential-1",
              updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
            }
          ),
        delete: CurrentCredential.pipe(Effect.asVoid),
        list: CurrentUser.pipe(
          Effect.as(
            options.credential === undefined ? [] : [options.credential]
          )
        ),
        logout: Effect.void,
        requestMfa: CurrentCredential.pipe(
          Effect.map((credential) => ({
            credentialId: credential.id,
            status: "mfa_requested" as const,
          }))
        ),
        validateMfa: () =>
          Effect.succeed({
            credential: options.credential ?? {
              alias: "Home",
              connectionStatus: "connected" as const,
              createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
              email: "user@example.com",
              id: "credential-1",
              updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
            },
            installations: options.installations ?? [],
          }),
      })
    );

  static readonly Live = Layer.effect(
    CredentialService,
    Effect.gen(function* () {
      const auth = yield* VerisureAuth;
      const crypto = yield* CredentialCrypto;
      const platformCrypto = yield* Crypto;
      const requests = yield* VerisureRequests;
      const repository = yield* CredentialRepository;

      const summarize = (row: VerisureCredentialRow) =>
        crypto.decryptString(row.encryptedEmail).pipe(
          Effect.map((email) => credentialSummary(row, email)),
          Effect.mapError(
            (cause) =>
              new ServiceUnavailable({
                cause,
                message: "Unable to read credential",
              })
          )
        );

      const list = Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* repository.listForUser(user.id);
        return yield* Effect.forEach(rows, summarize);
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to list credentials",
            })
        ),
        Effect.withSpan("CredentialService.list")
      );

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
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ServiceUnavailable({
                cause,
                message: "Unable to create credential",
              })
          )
        );

      const deleteCredential = Effect.gen(function* () {
        const credential = yield* CurrentCredential;
        yield* repository.delete({
          id: credential.id,
          userId: credential.userId,
        });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to delete credential",
            })
        ),
        Effect.withSpan("CredentialService.delete")
      );

      const listScopedInstallations = Effect.gen(function* () {
        yield* auth.ensureSession;
        const credentialRow = yield* CurrentCredential;
        const credential = yield* crypto.decryptCredential(credentialRow);
        return yield* requests.fetchAllInstallations({
          email: Redacted.value(credential.email),
        });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to list credential installations",
            })
        ),
        Effect.withSpan("CredentialService.listScopedInstallations")
      );

      const checkConnection = listScopedInstallations;

      const requestMfa = Effect.gen(function* () {
        const credential = yield* CurrentCredential;
        yield* auth.requestMfa;
        return {
          credentialId: credential.id,
          status: "mfa_requested" as const,
        };
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to request MFA",
            })
        ),
        Effect.withSpan("CredentialService.requestMfa")
      );

      const validateMfa: CredentialServiceShape["validateMfa"] = (code) =>
        Effect.gen(function* () {
          yield* auth.validateMfa(code);
          const installations = yield* listScopedInstallations;
          const current = yield* CurrentCredential;
          const credential = yield* summarize(current);
          return { credential, installations };
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ServiceUnavailable({
                cause,
                message: "Unable to validate MFA",
              })
          )
        );

      const logout = auth.logout.pipe(
        Effect.mapError(
          (cause) =>
            new ServiceUnavailable({
              cause,
              message: "Unable to log out credential",
            })
        )
      );

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
