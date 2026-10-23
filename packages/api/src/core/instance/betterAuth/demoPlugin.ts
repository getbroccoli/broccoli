import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { sessionMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";

import { ApplicationError } from "../../applicationError";
import type { Orm, Transact } from "../../db";
import { PrincipalSecurityContext } from "../../security";
import { type DemoReset, readInstance, exitDemo } from "../app";
import { demoDeadlineOf, SETUP_SESSION_DAYS } from "../domain";
import { inAuthTransaction } from "./authTransaction";
import { setSetupCookie } from "./setupCookie";

const NOT_IN_DEMO_RESET = {
  code: "NOT_IN_DEMO",
  message: "Only the demo's owner can reset setup before the demo ends",
};

/**
 * The demo's provisional owner after setup started the demo. `POST /api/auth/setup/demo/reset`
 * ends the demo and gives their browser setup again at the company step. Until then,
 * renewing their session never takes it past the deadline, so Better Auth itself refuses
 * it afterwards.
 */
export function demoPlugin(orm: Orm, transact: Transact, deleteAllEmployees: DemoReset) {
  return {
    id: "demo",
    init: () => ({
      options: {
        databaseHooks: {
          session: {
            update: {
              before: async (session, ctx) => {
                const userId = ctx?.context.session?.user.id;
                const deadline = userId ? demoDeadlineOf(await readInstance(orm), userId) : null;
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
      resetDemo: createAuthEndpoint(
        "/setup/demo/reset",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const { internalAdapter } = ctx.context;
          const setup = await refusingResetConflicts(() =>
            inAuthTransaction(transact, ctx, (tx) =>
              exitDemo(
                PrincipalSecurityContext.system(),
                tx,
                { userId, now: new Date() },
                {
                  clearPeople: deleteAllEmployees,
                  deleteOwner: async () => {
                    await internalAdapter.deleteUserSessions(userId);
                    await internalAdapter.deleteUser(userId);
                  },
                },
              ),
            ),
          );
          deleteSessionCookie(ctx);
          setSetupCookie(ctx, setup.token, SETUP_SESSION_DAYS * DAY_SECONDS);
          return ctx.json({ holder: "you" });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

const DAY_SECONDS = 24 * 60 * 60;

/** Answers anyone but the demo's owner before its end with 403. */
async function refusingResetConflicts<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      throw APIError.from("FORBIDDEN", NOT_IN_DEMO_RESET);
    }
    throw error;
  }
}
