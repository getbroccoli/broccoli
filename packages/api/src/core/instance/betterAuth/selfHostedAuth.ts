import { createAuth, fixedAuth, type AuthSource } from "../../auth";
import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import type { DemoReset, DemoStart } from "../app";
import { demoPlugin } from "./demoPlugin";
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
  /** Deletes the demo's people when its owner resets setup. */
  clearDemoPeople: DemoReset;
}

/** Better Auth of a self-hosted instance: password sign-in, and setup for the first visitor. */
export function selfHostedAuth({
  transact,
  prepareDemoStart,
  clearDemoPeople,
  ...options
}: SelfHostedAuthOptions): AuthSource {
  return fixedAuth(
    createAuth({
      ...options,
      plugins: [
        setupPlugin(options.orm, transact, prepareDemoStart),
        demoPlugin(options.orm, transact, clearDemoPeople),
      ],
    }),
  );
}
