import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { runWithAdapter } from "@better-auth/core/context";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { authDatabase } from "../auth";
import type { Orm } from "../db";
import { claimOwner, hasOwner, OwnerExistsError } from "./owner";
import { isSetupToken, removeSetupToken } from "./setup-token";

export const SETUP_ERROR_CODES = {
  OWNER_EXISTS: { code: "OWNER_EXISTS", message: "The owner account already exists" },
  INVALID_SETUP_TOKEN: { code: "INVALID_SETUP_TOKEN", message: "The setup token is not valid" },
} as const;

const setupBody = z.object({
  token: z.string(),
  email: z.string(),
  password: z.string(),
});

type SetupBody = z.infer<typeof setupBody>;

interface SetupDependencies {
  orm: Orm;
  dataDir: string;
}

/**
 * `POST /api/auth/setup`: whoever holds the setup token creates the owner account
 * and is signed in. Works once; for self-hosted instances only.
 */
export function setupPlugin({ orm, dataDir }: SetupDependencies) {
  return {
    id: "setup",
    endpoints: {
      setup: createAuthEndpoint("/setup", { method: "POST", body: setupBody }, async (ctx) => {
        assertValidCredentials(ctx.body, ctx.context.password.config);
        // Before the token: after setup the token is gone, so every token is wrong.
        if (await hasOwner(orm)) {
          throw APIError.from("CONFLICT", SETUP_ERROR_CODES.OWNER_EXISTS);
        }
        if (!(await isSetupToken(dataDir, ctx.body.token))) {
          throw APIError.from("FORBIDDEN", SETUP_ERROR_CODES.INVALID_SETUP_TOKEN);
        }
        // Hashing is slow, so it happens before the transaction takes its lock.
        const passwordHash = await ctx.context.password.hash(ctx.body.password);
        const owner = await createOwner(orm, ctx, ctx.body.email.toLowerCase(), passwordHash);
        await removeSetupToken(dataDir);
        await setSessionCookie(ctx, owner);
        return ctx.json({ user: { id: owner.user.id, email: owner.user.email } });
      }),
    },
  } satisfies BetterAuthPlugin;
}

function assertValidCredentials(
  { email, password }: SetupBody,
  limits: { minPasswordLength: number; maxPasswordLength: number },
): void {
  if (!z.email().safeParse(email).success) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
  }
  if (password.length < limits.minPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
  }
  if (password.length > limits.maxPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
  }
}

/** Creates the owner with a password and a session, in one transaction. */
async function createOwner(
  orm: Orm,
  ctx: GenericEndpointContext,
  email: string,
  passwordHash: string,
) {
  const { internalAdapter, options } = ctx.context;
  try {
    return await orm.transaction((tx) =>
      // Better Auth's writes join the transaction that holds the instance lock.
      runWithAdapter(authDatabase(tx)(options), () =>
        claimOwner(tx, async () => {
          const user = await internalAdapter.createUser(
            { email, name: "", emailVerified: false },
            { method: "email-password" },
          );
          await internalAdapter.linkAccount({
            userId: user.id,
            providerId: "credential",
            accountId: user.id,
            password: passwordHash,
          });
          return { user, session: await internalAdapter.createSession(user.id) };
        }),
      ),
    );
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      throw APIError.from("CONFLICT", SETUP_ERROR_CODES.OWNER_EXISTS);
    }
    throw error;
  }
}
