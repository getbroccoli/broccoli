import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import type { Transact } from "../../../core/db";
import { inAuthTransaction, linkPassword } from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { EmployeeInviteService } from "../app";

/** One answer for every link that does not open an invite, so none tells why. */
const INVITE_LINK_INVALID = {
  code: "INVITE_LINK_INVALID",
  message: "This invite link no longer works",
};

const tokenBody = z.object({ token: z.string().min(1).max(100) });

/**
 * The invite page's endpoints: `POST /api/auth/invite/lookup` answers what the page shows for a
 * token, and `POST /api/auth/invite/accept` sets the person's password, joins them and signs them
 * in. `inviteRateLimit` limits both before they run.
 */
export function invitePlugin(
  invites: EmployeeInviteService,
  { transact, logger }: { transact: Transact; logger: Logger },
) {
  return {
    id: "invite",
    endpoints: {
      lookUpInvite: createAuthEndpoint(
        "/invite/lookup",
        { method: "POST", body: tokenBody },
        async (ctx) => {
          const details = await invites.lookUp(ctx.body.token);
          if (!details) {
            logger.info({ reason: "link_invalid" }, "Invite lookup refused");
            throw APIError.from("BAD_REQUEST", INVITE_LINK_INVALID);
          }
          return ctx.json(details);
        },
      ),
      acceptInvite: createAuthEndpoint(
        "/invite/accept",
        { method: "POST", body: tokenBody.extend({ password: z.string() }) },
        async (ctx) => {
          const { token, password } = ctx.body;
          assertPasswordLength(password, ctx.context.password.config);
          // Checked early to skip the slow hashing; the transaction checks again.
          if (!(await invites.lookUp(token))) {
            logger.info({ reason: "link_invalid" }, "Invite accept refused");
            throw APIError.from("BAD_REQUEST", INVITE_LINK_INVALID);
          }
          const passwordHash = await ctx.context.password.hash(password);
          const { internalAdapter } = ctx.context;
          const joined = await inAuthTransaction(transact, ctx, (tx) =>
            invites.accept(tx, token, async ({ email, name }) => {
              // The link reached this address, which proves it.
              const user = await internalAdapter.createUser(
                { email, name, emailVerified: true },
                { method: "email-password" },
              );
              await linkPassword(ctx, user.id, passwordHash);
              return { user, session: await internalAdapter.createSession(user.id) };
            }),
          );
          if (!joined) {
            logger.info({ reason: "link_used_meanwhile" }, "Invite accept refused");
            throw APIError.from("BAD_REQUEST", INVITE_LINK_INVALID);
          }
          await setSessionCookie(ctx, joined);
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/** Refuses a password outside Better Auth's length limits, as its own sign-up would. */
function assertPasswordLength(
  password: string,
  limits: { minPasswordLength: number; maxPasswordLength: number },
): void {
  if (password.length < limits.minPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
  }
  if (password.length > limits.maxPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
  }
}
