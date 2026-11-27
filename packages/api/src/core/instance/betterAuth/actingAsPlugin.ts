import { createAuthEndpoint, createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { getSessionFromCtx, sessionMiddleware } from "better-auth/api";
import { z } from "zod";

import { ApplicationError } from "../../applicationError";
import type { Orm } from "../../db";
import type { EmployeeDirectory } from "../../security";
import type { ActingAsService } from "../app";
import { resolveSessionSecurity } from "./resolveSecurityContext";

/**
 * Acting as another employee in the browser session: `POST /api/auth/act-as` with the employee's
 * id starts it, `POST /api/auth/act-as/stop` ends it. Meanwhile every other auth endpoint refuses,
 * so nobody changes credentials, consents or setup as someone else.
 */
export function actingAsPlugin(orm: Orm, people: People) {
  const securityOf = async (session: BrowserSession) => {
    const security = await resolveSessionSecurity(orm, people, session);
    if (!security) throw APIError.from("UNAUTHORIZED", NO_SESSION);
    return security;
  };
  return {
    id: "acting-as",
    schema: {
      session: {
        fields: { actingAsEmployeeId: { type: "string", required: false, input: false } },
      },
    },
    hooks: { before: [refuseWhileActing(orm, people)] },
    endpoints: {
      actAs: createAuthEndpoint(
        "/act-as",
        { method: "POST", body: z.object({ employeeId: z.uuid() }), use: [sessionMiddleware] },
        async (ctx) => {
          const { session } = ctx.context;
          const { employeeId } = ctx.body;
          await refusingNotAllowed(async () =>
            people.actingAs.startActing(await securityOf(session), {
              sessionId: session.session.id,
              employeeId,
            }),
          );
          return ctx.json({ employeeId });
        },
      ),
      stopActing: createAuthEndpoint(
        "/act-as/stop",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const { session } = ctx.context;
          await people.actingAs.stopActing(await securityOf(session), session.session.id);
          return ctx.json({});
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

type People = { directory: EmployeeDirectory; actingAs: ActingAsService };

type BrowserSession = Parameters<typeof resolveSessionSecurity>[2];

/** What a session may still reach in `/api/auth` while it acts as another employee. */
const PATHS_WHILE_ACTING = new Set(["/get-session", "/sign-out", "/act-as/stop"]);

/**
 * Refuses every auth endpoint but session lookup, sign-out and stopping while the session acts as
 * someone else. Resolving the session first ends acting the user may no longer do, so the next
 * request goes through.
 */
function refuseWhileActing(orm: Orm, people: People) {
  return {
    matcher: (ctx: { path?: string }) => !PATHS_WHILE_ACTING.has(ctx.path ?? ""),
    handler: createAuthMiddleware(async (ctx) => {
      const session = await getSessionFromCtx(ctx);
      if (session?.session.actingAsEmployeeId) {
        await resolveSessionSecurity(orm, people, session);
        throw APIError.from("FORBIDDEN", ACTING_AS_EMPLOYEE);
      }
    }),
  };
}

const NO_SESSION = { code: "UNAUTHORIZED", message: "Sign in to continue" };

const ACTING_AS_EMPLOYEE = {
  code: "ACTING_AS_EMPLOYEE",
  message: "Stop acting as someone else to do this",
};

const NOT_ALLOWED_TO_ACT_AS = {
  code: "NOT_ALLOWED_TO_ACT_AS",
  message: "You cannot act as this person",
};

/** Answers a caller who may not act as the employee with 403. */
async function refusingNotAllowed(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      throw APIError.from("FORBIDDEN", NOT_ALLOWED_TO_ACT_AS);
    }
    throw error;
  }
}
