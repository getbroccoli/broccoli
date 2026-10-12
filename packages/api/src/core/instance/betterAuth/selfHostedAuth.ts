import { createAuth, fixedAuth, type AuthSource } from "../../auth";
import type { Orm } from "../../db";
import type { EventBus } from "../../events";
import type { Logger } from "../../logger";
import { setupPlugin } from "./setupPlugin";

export interface SelfHostedAuthOptions {
  orm: Orm;
  eventBus: EventBus;
  /** Signs session cookies. */
  secret: string;
  /** Unset takes the address from each request. */
  publicUrl?: string;
  logger: Logger;
}

/** Better Auth of a self-hosted instance: password sign-in, and setup for the first visitor. */
export function selfHostedAuth({ eventBus, ...options }: SelfHostedAuthOptions): AuthSource {
  return fixedAuth(createAuth({ ...options, plugins: [setupPlugin(options.orm, eventBus)] }));
}
