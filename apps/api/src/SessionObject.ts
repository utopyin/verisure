import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

export interface VerisureSessionObjectApi {
  readonly fetch: Effect.Effect<unknown, unknown>;
}

export class VerisureSessionObject extends Cloudflare.DurableObjectNamespace<
  VerisureSessionObject,
  VerisureSessionObjectApi
>()("VerisureSessionObject") {}

export const VerisureSessionObjectLive = VerisureSessionObject.make(
  Effect.succeed(
    Effect.succeed({
      fetch: HttpServerResponse.json({
        status: "session-object-placeholder",
      }),
    })
  )
);

export default VerisureSessionObjectLive;
