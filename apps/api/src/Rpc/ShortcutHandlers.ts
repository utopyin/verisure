import * as RpcContract from "@verisure/rpc-contract";
import * as Effect from "effect/Effect";

import { AuthMiddleware } from "./AuthMiddleware";

export const Rpcs = RpcContract.ShortcutRpcs.middleware(AuthMiddleware);

export const shortcutHandlers = Effect.succeed(
  Rpcs.of({
    "Shortcut.ExportShortcut": () =>
      Effect.fail(
        new RpcContract.InvalidInput({
          message: "Shortcut export is not implemented yet",
        })
      ),
    "Shortcut.ListApiTokens": () =>
      Effect.fail(
        new RpcContract.InvalidInput({
          message: "API token listing is not implemented yet",
        })
      ),
    "Shortcut.RevokeApiToken": () =>
      Effect.fail(
        new RpcContract.InvalidInput({
          message: "API token revocation is not implemented yet",
        })
      ),
  })
);
