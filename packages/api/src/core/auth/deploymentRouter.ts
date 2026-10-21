import { type Router, Router as createRouter } from "express";

import { authHandler, type AuthSource } from "./authSource";
import { refuseBearerAuth } from "./refuseBearerAuth";

/**
 * The deployment's routes in the order they must run, before any body parser: the bearer
 * refusal on `/api/auth`, then `beforeAuth` (the setup guard, or init and the waiting gate),
 * then Better Auth.
 */
export function deploymentRouter(auth: AuthSource, beforeAuth: Router): Router {
  return createRouter()
    .use("/api/auth", refuseBearerAuth)
    .use(beforeAuth)
    .all("/api/auth/{*path}", authHandler(auth));
}
