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

const OWNER_EXISTS = { code: "OWNER_EXISTS", message: "The owner account already exists" };

const setupBody = z.object({
  email: z.string(),
  password: z.string(),
});

type SetupBody = z.infer<typeof setupBody>;

/**
 * `POST /api/auth/setup`: the first caller creates the owner account and is signed
 * in. Works once; for self-hosted instances only.
 */
export function setupPlugin(orm: Orm) {
  return {
    id: "setup",
    endpoints: {
      setup: createAuthEndpoint("/setup", { method: "POST", body: setupBody }, async (ctx) => {
        assertValidCredentials(ctx.body, ctx.context.password.config);
        // Checked early to skip the slow hashing; the transaction checks again.
        if (await hasOwner(orm)) {
          throw APIError.from("CONFLICT", OWNER_EXISTS);
        }
        // Hashing is slow, so it happens before the transaction takes its lock.
        const passwordHash = await ctx.context.password.hash(ctx.body.password);
        const owner = await createOwner(orm, ctx, ctx.body.email.toLowerCase(), passwordHash);
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
      throw APIError.from("CONFLICT", OWNER_EXISTS);
    }
    throw error;
  }
}
