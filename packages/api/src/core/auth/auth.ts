import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthPlugin } from "better-auth";

import type { Orm } from "../db";
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
  logger: Logger;
}

export type Auth = ReturnType<typeof createAuth>;

/** Better Auth with email and password sign-in; nobody can sign up. */
export function createAuth({ orm, secret, publicUrl, plugins, logger }: AuthConfig) {
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
    plugins,
    telemetry: { enabled: false },
    logger: {
      log: (level, message, ...details: unknown[]) => {
        logger[level]({ details }, message);
      },
    },
  });
}

/** Better Auth's storage on `orm`, which may be a transaction. */
export function authDatabase(orm: Orm) {
  return drizzleAdapter(orm, {
    provider: "pg",
    schema: { user, session, account, verification },
    transaction: true,
  });
}
