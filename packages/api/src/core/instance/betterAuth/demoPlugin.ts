import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

import { ApplicationError } from "../../applicationError";
import { isUniqueViolation, type Orm, type Transact } from "../../db";
import { PrincipalSecurityContext } from "../../security";
import { finishDemo, readDemoDeadlineOf } from "../app";
import { inAuthTransaction } from "./authTransaction";
import { assertValidCredentials, credentialsBody, linkPassword } from "./credentials";

const NOT_IN_DEMO = {
  code: "NOT_IN_DEMO",
  message: "Only the demo's owner can create the account before the demo ends",
};

/**
 * The demo's provisional owner after setup started the demo. `POST /api/auth/setup/account`
 * gives them an email and password before the demo ends; until then, renewing their
 * session never takes it past the deadline, so Better Auth itself refuses it afterwards.
 */
export function demoPlugin(orm: Orm, transact: Transact) {
  return {
    id: "demo",
    init: () => ({
      options: {
        databaseHooks: {
          session: {
            update: {
              before: async (session, ctx) => {
                const userId = ctx?.context.session?.user.id;
                const deadline = userId ? await readDemoDeadlineOf(orm, userId) : null;
                return deadline && session.expiresAt && session.expiresAt > deadline
                  ? { data: { ...session, expiresAt: deadline } }
                  : undefined;
              },
            },
          },
        },
      },
    }),
    endpoints: {
      createAccount: createAuthEndpoint(
        "/setup/account",
        { method: "POST", body: credentialsBody, use: [sessionMiddleware] },
        async (ctx) => {
          assertValidCredentials(ctx.body, ctx.context.password.config);
          const passwordHash = await ctx.context.password.hash(ctx.body.password);
          const owner = await refusingAccountConflicts(() =>
            upgradeDemoOwner(transact, ctx, {
              userId: ctx.context.session.user.id,
              email: ctx.body.email.toLowerCase(),
              passwordHash,
            }),
          );
          await setSessionCookie(ctx, owner);
          return ctx.json({ user: { id: owner.user.id, email: owner.user.email } });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/**
 * Gives the demo's provisional owner an email and password, keeping their user, and
 * replaces their sessions with a new one, in one transaction.
 */
function upgradeDemoOwner(
  transact: Transact,
  ctx: GenericEndpointContext,
  { userId, email, passwordHash }: { userId: string; email: string; passwordHash: string },
) {
  const { internalAdapter } = ctx.context;
  return inAuthTransaction(transact, ctx, (tx) =>
    finishDemo(PrincipalSecurityContext.system(), tx, { userId, now: new Date() }, async () => {
      const user = await internalAdapter.updateUser(userId, { email });
      await linkPassword(ctx, userId, passwordHash);
      await internalAdapter.deleteUserSessions(userId);
      return { user, session: await internalAdapter.createSession(userId) };
    }),
  );
}

/** Answers anyone but the demo's owner before its end with 403, and a taken email with 422. */
async function refusingAccountConflicts<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      throw APIError.from("FORBIDDEN", NOT_IN_DEMO);
    }
    if (isUniqueViolation(error, "user_email_unique")) {
      throw APIError.from(
        "UNPROCESSABLE_ENTITY",
        BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
      );
    }
    throw error;
  }
}
