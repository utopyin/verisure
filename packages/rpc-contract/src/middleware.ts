import * as Context from "effect/Context";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

import { Unauthorized } from "./errors.ts";
import type { DashboardUser } from "./schemas.ts";

export class CurrentUser extends Context.Service<CurrentUser, DashboardUser>()(
  "@verisure/rpc-contract/CurrentUser"
) {}

export class DashboardAuthMiddleware extends RpcMiddleware.Service<
  DashboardAuthMiddleware,
  { readonly provides: CurrentUser }
>()("@verisure/rpc-contract/DashboardAuthMiddleware", {
  error: Unauthorized,
  requiredForClient: true,
}) {}
