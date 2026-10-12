import { randomBytes } from "node:crypto";

import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { runWithAdapter } from "@better-auth/core/context";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { authDatabase } from "../../auth";
import { ormOf, runInTransaction, type Orm } from "../../db";
import type { EventBus } from "../../events";
import type { ManagedAssignment } from "../../instance";
import { SignInRefusedError, signInWithTicket } from "../app";
import { InvalidTokenError, parseTicketClaims, type ManagedTicket } from "../domain";
import { verifyToken, type TokenCheck } from "../jwt";

const STATE_COOKIE = "__Host-managed_state";
const STATE_LIFETIME_SECONDS = 5 * 60;
const STATE_PATTERN = /^[a-f0-9]{64}$/;
const MAX_TICKET_LENGTH = 8192;
const SIGN_IN_METHODS = new Set(["google", "email"]);
const CALLBACK_PATH = "/api/auth/managed/callback";
// SameSite=None: the website's form POST must carry the cookie even across sites; the
// state match and the exact Origin check are what authorize the callback.
const STATE_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "none", path: "/" } as const;

type SignInError = "sign_in_required" | "sign_in_unavailable";

export interface ManagedSignInOptions {
  orm: Orm;
  eventBus: EventBus;
  assignment: ManagedAssignment;
  /** Tickets must be signed by the accounts service; the audience is the public origin. */
  tokenCheck: Omit<TokenCheck, "audience">;
}

/** Better Auth trusts the website's Origin on the callback only, never on other endpoints. */
export function callbackOnlyTrust({ websiteOrigin }: ManagedAssignment) {
  return (request?: Request): string[] =>
    request && new URL(request.url).pathname === CALLBACK_PATH ? [websiteOrigin] : [];
}

/**
 * `GET /api/auth/managed/start` sends the browser to the website's entry page with a
 * fresh state; `POST /api/auth/managed/callback` takes the ticket the website posts
 * back and signs its user in. Both answer with redirects, never JSON.
 */
export function managedSignInPlugin({
  orm,
  eventBus,
  assignment,
  tokenCheck,
}: ManagedSignInOptions) {
  const { companyId, publicOrigin, websiteOrigin } = assignment;
  const signInFailed = (error: SignInError) => redirect(`${publicOrigin}/login?error=${error}`);

  /** The posted ticket, when it comes from the website with this browser's state. */
  async function readTicket(
    ctx: GenericEndpointContext,
    ticket: unknown,
  ): Promise<ManagedTicket | null> {
    const state = ctx.getCookie(STATE_COOKIE);
    if (
      ctx.request?.headers.get("origin") !== websiteOrigin ||
      !state ||
      !STATE_PATTERN.test(state) ||
      typeof ticket !== "string" ||
      ticket.length > MAX_TICKET_LENGTH
    ) {
      return null;
    }
    const claims = parseTicketClaims(
      await verifyToken(ticket, { ...tokenCheck, audience: publicOrigin }),
    );
    return claims.company === companyId && claims.state === state ? claims : null;
  }

  /** Uses the ticket and creates the session in one transaction. */
  function signIn(ctx: GenericEndpointContext, ticket: ManagedTicket) {
    const { internalAdapter, options } = ctx.context;
    return runInTransaction(orm, eventBus, (tx) =>
      // Better Auth's writes join the transaction that uses the ticket.
      runWithAdapter(authDatabase(ormOf(tx))(options), async () => {
        const { userId } = await signInWithTicket(tx, ticket, () => new Date());
        const session = await internalAdapter.createSession(userId);
        const user = await internalAdapter.findUserById(userId);
        if (!user) {
          throw new Error("The signed-in user is missing");
        }
        return { session, user };
      }),
    );
  }

  return {
    id: "managed-sign-in",
    endpoints: {
      managedStart: createAuthEndpoint(
        "/managed/start",
        { method: "GET", query: z.object({ method: z.string().optional() }).optional() },
        (ctx) => {
          const state = randomBytes(32).toString("hex");
          ctx.setCookie(STATE_COOKIE, state, {
            ...STATE_COOKIE_OPTIONS,
            maxAge: STATE_LIFETIME_SECONDS,
          });
          const entry = new URL("/api/auth/managed/entry", websiteOrigin);
          entry.searchParams.set("company", companyId);
          entry.searchParams.set("state", state);
          const method = ctx.query?.method;
          if (method && SIGN_IN_METHODS.has(method)) {
            entry.searchParams.set("method", method);
          }
          return Promise.resolve(redirect(entry.href));
        },
      ),
      managedCallback: createAuthEndpoint(
        "/managed/callback",
        {
          method: "POST",
          body: z.object({ ticket: z.unknown().optional() }),
          metadata: { allowedMediaTypes: ["application/x-www-form-urlencoded"] },
        },
        async (ctx) => {
          // The state is single-use: cleared whatever the outcome.
          ctx.setCookie(STATE_COOKIE, "", { ...STATE_COOKIE_OPTIONS, maxAge: 0 });
          try {
            const ticket = await readTicket(ctx, ctx.body.ticket);
            if (!ticket) {
              return signInFailed("sign_in_required");
            }
            await setSessionCookie(ctx, await signIn(ctx, ticket));
            return redirect(`${publicOrigin}/`);
          } catch (error) {
            if (error instanceof InvalidTokenError || error instanceof SignInRefusedError) {
              return signInFailed("sign_in_required");
            }
            // Never log the ticket, the cookie or the request body.
            ctx.context.logger.error("Managed sign-in failed", { error: (error as Error).name });
            return signInFailed("sign_in_unavailable");
          }
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/** A 303, so the browser follows a form POST with a GET; Better Auth adds the cookies. */
function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
