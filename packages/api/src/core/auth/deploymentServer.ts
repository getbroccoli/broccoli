import type { Request, Router } from "express";

import type { SecurityResolver } from "../security";

/**
 * What the deployment mode adds to the server, self-hosted or managed: its routes, who a request
 * is, and the address browsers use.
 */
export interface DeploymentServer {
  /** Runs before GraphQL and the modules: the setup guard or init, then Better Auth; see `deploymentRouter`. */
  router: Router;
  resolveSecurity: SecurityResolver;
  /** Managed only: `waiting` until the signed init, then `ready`. */
  initStatus?: () => Promise<"waiting" | "ready">;
  /** The origin browsers reach this instance at, for links that leave Broccoli and come back. */
  publicOrigin: (request: Request) => Promise<string>;
}
