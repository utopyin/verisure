import type { ShortcutTemplate } from "@verisure/domain";
import type { ApiTokenRecord } from "@verisure/interface";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ShortcutExportRepository } from "../Repositories/ShortcutExportRepository";
import { RuntimeConfig } from "../Runtime/RuntimeConfig";
import { CurrentUser } from "../Security/RequestContext";
import { ApiTokenService, ShortcutAlarmScopes } from "./ApiTokenService";
import type { CredentialNotFound } from "./ServiceError";
import { ServiceUnavailable } from "./ServiceError";

export interface ShortcutExportCommand {
  readonly credentialId: string;
  readonly giid?: string;
  readonly template: ShortcutTemplate;
}

export interface ShortcutExportPayload {
  readonly apiUrl: string;
  readonly bearerToken: string;
  readonly credentialId: string;
  readonly downloadUrl?: string;
  readonly giid?: string;
  readonly instructions: readonly string[];
  readonly shortcutName: string;
  readonly template: ShortcutTemplate;
}

export interface ShortcutExportResult extends ShortcutExportPayload {
  readonly apiToken: ApiTokenRecord;
}

export interface ShortcutExportServiceShape {
  readonly exportShortcut: (
    command: ShortcutExportCommand
  ) => Effect.Effect<
    ShortcutExportResult,
    CredentialNotFound | ServiceUnavailable,
    CurrentUser
  >;
}

export class ShortcutExportService extends Context.Service<
  ShortcutExportService,
  ShortcutExportServiceShape
>()("@verisure/server/ShortcutExportService") {
  static readonly Test = (options: {
    readonly apiToken: ApiTokenRecord;
    readonly apiUrl?: string;
    readonly bearerToken?: string;
    readonly instructions?: readonly string[];
    readonly shortcutName?: string;
  }) =>
    Layer.succeed(
      ShortcutExportService,
      ShortcutExportService.of({
        exportShortcut: (command) =>
          Effect.succeed({
            apiToken: options.apiToken,
            apiUrl: options.apiUrl ?? "https://verisure.utopy.sh/api/v1",
            bearerToken: options.bearerToken ?? "vs_plaintext",
            credentialId: command.credentialId,
            ...(command.giid === undefined ? {} : { giid: command.giid }),
            instructions: options.instructions ?? ["guided fallback"],
            shortcutName:
              options.shortcutName ??
              (command.template === "toggle-full"
                ? "Verisure Toggle Full Alarm"
                : "Verisure Choose Alarm Mode"),
            template: command.template,
          }),
      })
    );

  static readonly Live = Layer.effect(
    ShortcutExportService,
    Effect.gen(function* () {
      const config = yield* RuntimeConfig;
      const tokenService = yield* ApiTokenService;
      const exports = yield* ShortcutExportRepository;

      const exportShortcut: ShortcutExportServiceShape["exportShortcut"] = (
        command
      ) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const createdToken = yield* tokenService.create({
            allowedGiids:
              command.giid === undefined ? undefined : [command.giid],
            credentialId: command.credentialId,
            scopes: ShortcutAlarmScopes,
          });

          yield* exports.create({
            apiTokenId: createdToken.token.id,
            credentialId: command.credentialId,
            id: crypto.randomUUID(),
            now: new Date(),
            template: command.template,
            userId: user.id,
          });

          const payload = renderGuidedShortcutPayload({
            appBaseUrl: config.appBaseUrl,
            credentialId: command.credentialId,
            giid: command.giid,
            plaintextToken: createdToken.plaintextToken,
            template: command.template,
          });

          return {
            ...payload,
            apiToken: createdToken.token,
          };
        }).pipe(
          Effect.catchTag("RepositoryError", (cause) =>
            Effect.fail(
              new ServiceUnavailable({
                cause,
                message: "Unable to record shortcut export",
              })
            )
          )
        );

      return ShortcutExportService.of({ exportShortcut });
    })
  );
}

interface RenderInput {
  readonly appBaseUrl: string;
  readonly credentialId: string;
  readonly giid?: string;
  readonly plaintextToken: string;
  readonly template: ShortcutTemplate;
}

const renderGuidedShortcutPayload = (
  input: RenderInput
): ShortcutExportPayload => {
  const apiUrl = `${input.appBaseUrl.replace(/\/$/u, "")}/api/v1`;
  const shortcutName =
    input.template === "toggle-full"
      ? "Verisure Toggle Full Alarm"
      : "Verisure Choose Alarm Mode";
  const giidLine =
    input.giid === undefined
      ? "Use your default installation GIID, or fill in the giid field before running the shortcut."
      : `Use GIID ${input.giid}.`;

  const instructions =
    input.template === "toggle-full"
      ? [
          `Create a new iPhone Shortcut named “${shortcutName}”.`,
          `Set a Text action named API Base URL to ${apiUrl}.`,
          `Set a Text action named Bearer Token to ${input.plaintextToken}. This token is shown once; revoke it from the dashboard if it is exposed.`,
          giidLine,
          "Add Get Contents of URL for GET /alarm/status with Authorization: Bearer <token>.",
          "If the returned type is ARMED_AWAY, POST /alarm/mode with mode DISARMED; otherwise POST /alarm/mode with mode ARMED_AWAY.",
        ]
      : [
          `Create a new iPhone Shortcut named “${shortcutName}”.`,
          `Set a Text action named API Base URL to ${apiUrl}.`,
          `Set a Text action named Bearer Token to ${input.plaintextToken}. This token is shown once; revoke it from the dashboard if it is exposed.`,
          giidLine,
          "Add a Choose from Menu action with “Full off” and “Full on”.",
          "For “Full off”, POST /alarm/mode with mode DISARMED. For “Full on”, POST /alarm/mode with mode ARMED_AWAY.",
        ];

  return {
    apiUrl,
    bearerToken: input.plaintextToken,
    credentialId: input.credentialId,
    ...(input.giid === undefined ? {} : { giid: input.giid }),
    instructions,
    shortcutName,
    template: input.template,
  };
};
