import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";

import type { Orm, OrmTransaction } from "../db";
import type { Logger } from "../logger";
import { account, session, user, verification } from "./schema";

export const PASSWORD_LENGTH = { min: 8, max: 128 } as const;

export interface AuthConfig {
  orm: Orm;
  /** Signs session cookies. */
  secret: string;
  /** Unset takes the address from each request. */
  publicUrl?: string;
  plugins: BetterAuthPlugin[];
  /** Origins Better Auth trusts besides its own; may depend on the request. */
  trustedOrigins?: BetterAuthOptions["trustedOrigins"];
  logger: Logger;
}

// Better Auth infers its API from the options, which no hand-written interface can state.
// eslint-disable-next-line no-restricted-syntax
export type Auth = ReturnType<typeof createBetterAuth>;

/** Better Auth with email and password sign-in; nobody can sign up. */
export function createBetterAuth({
  orm,
  secret,
  publicUrl,
  plugins,
  trustedOrigins,
  logger,
}: AuthConfig) {
  return betterAuth({
    database: authDatabase(orm),
    secret,
    baseURL: publicUrl,
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_LENGTH.min,
      maxPasswordLength: PASSWORD_LENGTH.max,
    },
    user: {
      // Read with the session; only Broccoli's own use case sets it.
      additionalFields: {
        permissionProfile: { type: "string", required: false, input: false },
      },
    },
    plugins,
    trustedOrigins,
    telemetry: { enabled: false },
    advanced: {
      // Better Auth skips its origin check under test runners; keep it on so tests see production behaviour.
      disableOriginCheck: false,
      // Without a public URL the protocol is unknown, and a Secure cookie would be
      // dropped by browsers on plain HTTP; HTTPS installs use an https public URL.
      useSecureCookies: publicUrl !== undefined && new URL(publicUrl).protocol === "https:",
    },
    logger: {
      log: (level, message, ...details: unknown[]) => {
        logger[level]({ details }, message);
      },
    },
  });
}

/** Better Auth's storage on `orm`, which may be a transaction. */
export function authDatabase(orm: Orm | OrmTransaction) {
  return drizzleAdapter(orm, {
    provider: "pg",
    schema: { user, session, account, verification },
    transaction: true,
  });
}
