import type { DeploymentServer } from "../auth";
import type { Orm, Transact } from "../db";
import type { Logger } from "../logger";
import type { AddApprovedPeople, SetupDemo } from "./app";
import { selfHostedAuth } from "./betterAuth";
import { setupRouter } from "./http";

export interface SelfHostedServerOptions {
  orm: Orm;
  transact: Transact;
  /** Signs session cookies. */
  secret: string;
  logger: Logger;
  /** `SELF_HOSTED_PUBLIC_URL`; unset takes the address from each request. */
  publicUrl?: string;
  demo: SetupDemo;
  addApprovedPeople: AddApprovedPeople;
}

/**
 * Wires a self-hosted instance: password sign-in and setup for the first visitor, whose
 * endpoints its router limits and origin-checks.
 */
export function selfHostedServer({
  publicUrl,
  ...options
}: SelfHostedServerOptions): DeploymentServer {
  const publicOrigin = publicUrl && new URL(publicUrl).origin;
  return {
    auth: selfHostedAuth({ ...options, publicUrl }),
    router: setupRouter(publicUrl),
    publicOrigin: (request) =>
      Promise.resolve(publicOrigin || `${request.protocol}://${request.host}`),
  };
}
