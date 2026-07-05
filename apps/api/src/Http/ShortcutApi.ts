import * as Domain from "@verisure/domain";
import * as Schema from "effect/Schema";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";

import { ShortcutRestErrorSchemas } from "./ShortcutErrors";
import {
  ShortcutAuthorization,
  ShortcutSchemaErrorHandler,
} from "./ShortcutMiddleware";

const GiidQuery = Schema.Struct({ giid: Schema.NonEmptyString });

const ToggleFullPayload = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  giid: Schema.NonEmptyString,
});

const SetModePayload = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  giid: Schema.NonEmptyString,
  mode: Domain.AlarmModeSchema,
});

class ShortcutAlarmApiGroup extends HttpApiGroup.make("alarm")
  .add(
    HttpApiEndpoint.get("status", "/status", {
      error: ShortcutRestErrorSchemas,
      query: GiidQuery,
      success: Domain.ArmStateSchema,
    }),
    HttpApiEndpoint.post("toggleFull", "/toggle-full", {
      error: ShortcutRestErrorSchemas,
      payload: ToggleFullPayload,
      success: Domain.AlarmMutationResultSchema,
    }),
    HttpApiEndpoint.post("setMode", "/mode", {
      error: ShortcutRestErrorSchemas,
      payload: SetModePayload,
      success: Domain.AlarmMutationResultSchema,
    })
  )
  .middleware(ShortcutAuthorization)
  .middleware(ShortcutSchemaErrorHandler)
  .prefix("/api/v1/alarm")
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
