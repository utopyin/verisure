import * as Domain from "@verisure/domain";
import * as Schema from "effect/Schema";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";

import {
  ShortcutAlarmReadAccess,
  ShortcutAlarmWriteAccess,
  ShortcutApiTokenPrincipal,
  ShortcutAuthorization,
} from "./ShortcutMiddleware";

const GiidParams = Schema.Struct({ giid: Schema.NonEmptyString });

const ToggleFullPayload = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
});

const SetModePayload = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  mode: Domain.AlarmModeSchema,
});

class ShortcutAlarmApiGroup extends HttpApiGroup.make("alarm")
  .add(
    HttpApiEndpoint.get("status", "/installations/:giid/alarm/status", {
      error: HttpApiError.ServiceUnavailableNoContent,
      params: GiidParams,
      success: Domain.ArmStateSchema,
    }).middleware(ShortcutAlarmReadAccess),
    HttpApiEndpoint.post(
      "toggleFull",
      "/installations/:giid/alarm/toggle-full",
      {
        error: [
          HttpApiError.BadRequestNoContent,
          HttpApiError.ServiceUnavailableNoContent,
        ],
        params: GiidParams,
        payload: ToggleFullPayload,
        success: Domain.AlarmMutationResultSchema,
      }
    ).middleware(ShortcutAlarmWriteAccess),
    HttpApiEndpoint.post("setMode", "/installations/:giid/alarm/mode", {
      error: [
        HttpApiError.BadRequestNoContent,
        HttpApiError.ServiceUnavailableNoContent,
      ],
      params: GiidParams,
      payload: SetModePayload,
      success: Domain.AlarmMutationResultSchema,
    }).middleware(ShortcutAlarmWriteAccess)
  )
  .middleware(ShortcutApiTokenPrincipal)
  .middleware(ShortcutAuthorization)
  .prefix("/api/v1")
  .annotateMerge(
    OpenApi.annotations({
      description: "Shortcut alarm endpoints",
      title: "Shortcut alarm",
    })
  ) {}

export class ShortcutApi extends HttpApi.make("ShortcutApi")
  .add(ShortcutAlarmApiGroup)
  .annotateMerge(
    OpenApi.annotations({
      title: "Verisure Shortcut REST API",
    })
  ) {}
