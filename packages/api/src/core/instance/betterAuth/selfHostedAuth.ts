import { createBetterAuth, fixedAuth, type AuthSource } from "../../auth";
import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import type { AddApprovedPeople, SetupDemo } from "../app";
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
  demo: SetupDemo;
  addApprovedPeople: AddApprovedPeople;
}

/** Better Auth of a self-hosted instance: password sign-in, and setup for the first visitor. */
export function selfHostedAuth({
  transact,
  demo,
  addApprovedPeople,
  ...options
}: SelfHostedAuthOptions): AuthSource {
  return fixedAuth(
    createBetterAuth({
      ...options,
      plugins: [
        setupPlugin(options.orm, transact, {
          prepareDemoStart: demo.prepareStart,
          addApprovedPeople,
        }),
        demoPlugin(options.orm, transact, demo.deleteAllEmployees),
      ],
    }),
  );
}
