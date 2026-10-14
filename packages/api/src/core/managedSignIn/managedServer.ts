import type { Router } from "express";
import express from "express";
import { createRemoteJWKSet } from "jose";

import { createAuth, type AuthSource } from "../auth";
import type { Orm, Transact } from "../db";
import type { ManagedDeployment } from "../env";
import type { Logger } from "../logger";
import type { Readiness } from "../readiness";
import { managedAuth } from "./app";
import { callbackOnlyTrust, managedSignInPlugin } from "./betterAuth";
import { initRouter, waitingGate } from "./http";

export interface ManagedServerOptions {
  deployment: ManagedDeployment;
  orm: Orm;
  transact: Transact;
  /** Signs session cookies. */
  secret: string;
  readiness: Readiness;
  logger: Logger;
}

/** What a managed instance adds to the server: its auth, its routes and its init status. */
export interface ManagedServer {
  auth: AuthSource;
  /** `POST /api/init`, then the gate that answers 503 to users until init. Mount after the probes. */
  router: Router;
  initStatus(): Promise<"waiting" | "ready">;
}

/**
 * Wires a managed instance: it trusts init tokens and tickets signed by the accounts
 * service, and builds Better Auth from the assignment its init stored.
 */
export function managedServer({
  deployment: { instanceId, accountsOrigin },
  orm,
  transact,
  secret,
  readiness,
  logger,
}: ManagedServerOptions): ManagedServer {
  const signer = {
    issuer: accountsOrigin,
    keys: createRemoteJWKSet(new URL("/.well-known/jwks.json", accountsOrigin)),
  };
  const auth = managedAuth(orm, (assignment) =>
    createAuth({
      orm,
      secret,
      logger,
      publicUrl: assignment.publicOrigin,
      plugins: [managedSignInPlugin({ transact, assignment, tokenCheck: signer })],
      trustedOrigins: callbackOnlyTrust(assignment),
    }),
  );
  const tokenCheck = { ...signer, audience: `instance:${instanceId}` };
  return {
    auth,
    router: express
      .Router()
      .use(initRouter({ transact, tokenCheck, readiness, auth }))
      .use(waitingGate(auth)),
    initStatus: async () => ((await auth.current()) ? "ready" : "waiting"),
  };
}
