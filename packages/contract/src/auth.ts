import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

export const AuthRpcs = RpcGroup.make(
  Rpc.make("GetSession", {
    success: Schema.Struct({
      expiresAt: Schema.String,
      user: Schema.Struct({
        email: Schema.String,
        id: Schema.String,
        name: Schema.optionalKey(Schema.String),
      }),
    }),
  }),
  Rpc.make("Logout")
).prefix("Auth.");
