import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";

import type { Orm, OrmTransaction } from "../db";
import type { Logger } from "../logger";
import { account, session, user, verification } from "./schema";

export const PASSWORD_LENGTH = { min: 8, max: 128 } as const;

/** How long a password reset link works. */
const RESET_PASSWORD_SECONDS = 60 * 60;

export interface AuthConfig {
  orm: Orm;
  /** Signs session cookies. */
  secret: string;
  /** Unset takes the address from each request. */
  publicUrl?: string;
  plugins: BetterAuthPlugin[];
  /** Origins Better Auth trusts besides its own; may depend on the request. */
  trustedOrigins?: BetterAuthOptions["trustedOrigins"];
  /** Emails a password reset token; without it nobody can reset a password. */
  sendResetPassword?: (user: { id: string }, token: string) => Promise<void>;
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
  sendResetPassword,
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
      sendResetPassword: sendResetPassword && (({ user, token }) => sendResetPassword(user, token)),
      resetPasswordTokenExpiresIn: RESET_PASSWORD_SECONDS,
      // A reset may follow a stolen password, so it signs out every browser.
      revokeSessionsOnPasswordReset: true,
    },
    // Only the hash of a reset token is stored, so a database read cannot take over an account.
    verification: {
      storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } },
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
