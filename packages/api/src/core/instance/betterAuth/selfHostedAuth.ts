import { createAuth, fixedAuth, type AuthSource } from "../../auth";
import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import type { DemoStart } from "../app";
import { setupPlugin } from "./setupPlugin";

export interface SelfHostedAuthOptions {
  orm: Orm;
  transact: Transact;
  /** Signs session cookies. */
  secret: string;
  /** Unset takes the address from each request. */
  publicUrl?: string;
  logger: Logger;
  /** The demo company's start, run when setup starts the demo. */
  prepareDemoStart: () => Promise<DemoStart>;
}

/** Better Auth of a self-hosted instance: password sign-in, and setup for the first visitor. */
export function selfHostedAuth({
  transact,
  prepareDemoStart,
  ...options
}: SelfHostedAuthOptions): AuthSource {
  return fixedAuth(
    createAuth({ ...options, plugins: [setupPlugin(options.orm, transact, prepareDemoStart)] }),
  );
}
