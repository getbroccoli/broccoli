import express from "express";
import { createRemoteJWKSet } from "jose";

import { createBetterAuth, type DeploymentServer } from "../auth";
import type { Orm, Transact } from "../db";
import type { ManagedDeployment } from "../env";
import { readInstance } from "../instance";
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

/**
 * Wires a managed instance: it trusts init tokens and tickets signed by the accounts
 * service, and builds Better Auth from the assignment its init stored. Its router is
 * `POST /api/init`, then the gate that answers 503 to users until init.
 */
export function managedServer({
  deployment: { instanceId, accountsOrigin },
  orm,
  transact,
  secret,
  readiness,
  logger,
}: ManagedServerOptions): DeploymentServer {
  const signer = {
    issuer: accountsOrigin,
    keys: createRemoteJWKSet(new URL("/.well-known/jwks.json", accountsOrigin)),
  };
  const auth = managedAuth(orm, (assignment) =>
    createBetterAuth({
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
      .use(initRouter({ transact, tokenCheck, readiness, auth, logger, instanceId }))
      .use(waitingGate(auth)),
    initStatus: async () => ((await auth.current()) ? "ready" : "waiting"),
    // The waiting gate answers until init stored the assignment, so it exists here.
    publicOrigin: async () => (await readInstance(orm)).assignment!.publicOrigin,
  };
}
