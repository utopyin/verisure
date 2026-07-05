import * as RpcContract from "@verisure/rpc-contract";
import * as Server from "@verisure/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

export class CredentialScopeMiddleware extends RpcMiddleware.Service<
  CredentialScopeMiddleware,
  {
    readonly provides: Server.CurrentCredential;
    readonly requires: Server.CurrentUser;
  }
>()("@verisure/api/CredentialScopeMiddleware", {
  error: RpcContract.CredentialScopeError,
}) {}

export class InstallationScopeMiddleware extends RpcMiddleware.Service<
  InstallationScopeMiddleware,
  {
    readonly provides: Server.CurrentInstallation;
    readonly requires: Server.CurrentCredential;
  }
>()("@verisure/api/InstallationScopeMiddleware", {
  error: RpcContract.InstallationScopeError,
}) {}

export const CredentialScopeMiddlewareLive = Layer.effect(
  CredentialScopeMiddleware,
  Effect.gen(function* () {
    const credentials = yield* Server.CredentialRepository;

    return CredentialScopeMiddleware.of((effect, options) =>
      Effect.gen(function* () {
        const credentialId = yield* getStringPayloadField(
          options.payload,
          "credentialId"
        );

        const credential = yield* Effect.gen(function* () {
          const user = yield* Server.CurrentUser;
          const credential = yield* credentials.getOwnedById({
            id: credentialId,
            userId: user.id,
          });

          if (Option.isNone(credential)) {
            return yield* new Server.ScopeError({
              credentialId,
              message: "Credential not found or not owned by current user",
            });
          }

          return credential.value;
        }).pipe(
          Effect.catchTags({
            RepositoryError: (error) => Effect.die(error),
            ScopeError: (error) =>
              Effect.fail(
                new RpcContract.CredentialNotFound({
                  credentialId: error.credentialId ?? "",
                  message: "Credential not found",
                })
              ),
          })
        );

        return yield* Effect.provideService(
          effect,
          Server.CurrentCredential,
          credential
        );
      })
    );
  })
);

export const InstallationScopeMiddlewareLive = Layer.effect(
  InstallationScopeMiddleware,
  Effect.gen(function* () {
    const crypto = yield* Server.CredentialCrypto;
    const requests = yield* Server.VerisureRequests;

    return InstallationScopeMiddleware.of((effect, options) =>
      Effect.gen(function* () {
        const giid = yield* getStringPayloadField(options.payload, "giid");

        yield* Effect.gen(function* () {
          const credentialRow = yield* Server.CurrentCredential;
          const credential = yield* crypto.decryptCredential(credentialRow);
          const installations = yield* requests.fetchAllInstallations({
            email: Redacted.value(credential.email),
          });

          if (
            installations.some((installation) => installation.giid === giid)
          ) {
            return;
          }

          return yield* new Server.ScopeError({
            credentialId: credentialRow.id,
            giid,
            message:
              "Installation not found or not owned by current credential",
          });
        }).pipe(
          Effect.catchTag("ScopeError", (error) =>
            Effect.fail(
              new RpcContract.InstallationNotFound({
                giid: error.giid ?? "",
                message: "Installation not found",
              })
            )
          ),
          Effect.catch((error) =>
            error instanceof RpcContract.InstallationNotFound
              ? Effect.fail(error)
              : Effect.die(error)
          )
        );

        return yield* Effect.provideService(
          effect,
          Server.CurrentInstallation,
          {
            giid,
          }
        );
      })
    );
  })
);

const getStringPayloadField = (
  payload: unknown,
  field: string
): Effect.Effect<string, RpcContract.InvalidInput> => {
  if (typeof payload !== "object" || payload === null) {
    return invalidPayload(field);
  }

  const value = (payload as Record<string, unknown>)[field];
  if (typeof value !== "string" || value.length === 0) {
    return invalidPayload(field);
  }

  return Effect.succeed(value);
};

const invalidPayload = (field: string) =>
  Effect.fail(
    new RpcContract.InvalidInput({
      field,
      message: `Expected payload field ${field}`,
    })
  );
