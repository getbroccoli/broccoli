import type { Request, Router } from "express";

import type { AuthSource } from "./authSource";

/**
 * What the deployment mode adds to the server, self-hosted or managed: its auth, its routes and
 * the address browsers use.
 */
export interface DeploymentServer {
  auth: AuthSource;
  /** Routes that run before the auth handler and the modules, such as setup guards or init. */
  router: Router;
  /** Managed only: `waiting` until the signed init, then `ready`. */
  initStatus?: () => Promise<"waiting" | "ready">;
  /** The origin browsers reach this instance at, for links that leave Broccoli and come back. */
  publicOrigin: (request: Request) => Promise<string>;
}
