import { randomBytes } from "node:crypto";

import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { runWithAdapter } from "@better-auth/core/context";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { authDatabase } from "../../auth";
import { ormOf, type Transact } from "../../db";
import type { ManagedAssignment } from "../../instance";
import { PrincipalSecurityContext } from "../../security";
import { createManagedSignInService, SignInRefusedError } from "../app";
import { InvalidTokenError, type ManagedTicket } from "../domain";
import { parseTicketClaims } from "../jwt";
import { verifyToken, type TokenCheck } from "../jwt";

const STATE_COOKIE = "__Host-managed_state";
/** Where the browser goes after signing in, such as back to an agent's Allow page. */
const RETURN_COOKIE = "__Host-managed_return";
const STATE_LIFETIME_SECONDS = 5 * 60;
const STATE_PATTERN = /^[a-f0-9]{64}$/;
const MAX_TICKET_LENGTH = 8192;
const SIGN_IN_METHODS = new Set(["google", "email"]);
const CALLBACK_PATH = "/api/auth/managed/callback";

const managedSignIn = createManagedSignInService();
// SameSite=None: the website's form POST must carry the cookie even across sites; the
// state match and the exact Origin check are what authorize the callback.
const STATE_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "none", path: "/" } as const;

type SignInError = "sign_in_required" | "sign_in_unavailable";

export interface ManagedSignInOptions {
  transact: Transact;
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
// eslint-disable-next-line broccoli/max-lines-per-function -- an endpoint table; each handler is checked on its own.
export function managedSignInPlugin(options: ManagedSignInOptions) {
  const { companyId, publicOrigin, websiteOrigin } = options.assignment;
  // A retry from the login page still returns where the sign-in was going.
  const signInFailed = (error: SignInError, returnPath: string) => {
    const query = new URLSearchParams({ error });
    if (returnPath !== "/") {
      query.set("redirect", returnPath);
    }
    return redirect(`${publicOrigin}/login?${query.toString()}`);
  };

  return {
    id: "managed-sign-in",
    endpoints: {
      managedStart: createAuthEndpoint(
        "/managed/start",
        {
          method: "GET",
          query: z
            .object({ method: z.string().optional(), redirect: z.string().optional() })
            .optional(),
        },
        (ctx) => {
          const state = randomBytes(32).toString("hex");
          ctx.setCookie(STATE_COOKIE, state, {
            ...STATE_COOKIE_OPTIONS,
            maxAge: STATE_LIFETIME_SECONDS,
          });
          const returnPath = localPathOf(ctx.query?.redirect, publicOrigin);
          ctx.setCookie(RETURN_COOKIE, returnPath ?? "", {
            ...STATE_COOKIE_OPTIONS,
            maxAge: returnPath ? STATE_LIFETIME_SECONDS : 0,
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
          // The state is single-use: cleared whatever the outcome, with where to return.
          const returnPath = localPathOf(ctx.getCookie(RETURN_COOKIE), publicOrigin) ?? "/";
          ctx.setCookie(STATE_COOKIE, "", { ...STATE_COOKIE_OPTIONS, maxAge: 0 });
          ctx.setCookie(RETURN_COOKIE, "", { ...STATE_COOKIE_OPTIONS, maxAge: 0 });
          try {
            const ticket = await readTicket(ctx, ctx.body.ticket, options);
            if (!ticket) {
              return signInFailed("sign_in_required", returnPath);
            }
            await setSessionCookie(ctx, await signIn(ctx, ticket, options.transact));
            return redirect(`${publicOrigin}${returnPath}`);
          } catch (error) {
            if (error instanceof InvalidTokenError || error instanceof SignInRefusedError) {
              return signInFailed("sign_in_required", returnPath);
            }
            // Never log the ticket, the cookie or the request body.
            ctx.context.logger.error("Managed sign-in failed", { error: (error as Error).name });
            return signInFailed("sign_in_unavailable", returnPath);
          }
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/** The posted ticket, when it comes from the website with this browser's state. */
async function readTicket(
  ctx: GenericEndpointContext,
  ticket: unknown,
  { assignment, tokenCheck }: ManagedSignInOptions,
): Promise<ManagedTicket | null> {
  const { companyId, publicOrigin, websiteOrigin } = assignment;
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
function signIn(ctx: GenericEndpointContext, ticket: ManagedTicket, transact: Transact) {
  const { internalAdapter, options } = ctx.context;
  return transact((tx) =>
    // Better Auth's writes join the transaction that uses the ticket.
    runWithAdapter(authDatabase(ormOf(tx))(options), async () => {
      const { userId } = await managedSignIn.signInWithTicket(
        PrincipalSecurityContext.system(),
        tx,
        ticket,
        () => new Date(),
      );
      const session = await internalAdapter.createSession(userId);
      const user = await internalAdapter.findUserById(userId);
      if (!user) {
        throw new Error("The signed-in user is missing");
      }
      return { session, user };
    }),
  );
}

/** A 303, so the browser follows a form POST with a GET; Better Auth adds the cookies. */
function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

/**
 * `raw` as a path on `origin` (path, query and hash), or null when it could lead elsewhere:
 * another site, a protocol-relative or backslashed address, or control characters.
 */
function localPathOf(raw: string | null | undefined, origin: string): string | null {
  if (
    !raw?.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    hasControlCharacter(raw)
  ) {
    return null;
  }
  const url = new URL(raw, origin);
  // Checked after parsing, which resolves dot segments: `/a/..//x` becomes `//x`.
  return url.origin === origin && !url.pathname.startsWith("//")
    ? url.pathname + url.search + url.hash
    : null;
}

function hasControlCharacter(text: string): boolean {
  return [...text].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}
