import type { GenericEndpointContext } from "@better-auth/core";
import { parseCookies } from "better-auth/cookies";

/** The cookie that carries the setup holder's token. */
export const SETUP_COOKIE = "broccoli_setup";

/** The setup token a request carries, or null. */
export function readSetupToken(cookieHeader: string | undefined): string | null {
  return (cookieHeader && parseCookies(cookieHeader).get(SETUP_COOKIE)) || null;
}

/** Sets the setup cookie like the session cookie: HttpOnly, SameSite=Lax, Secure on HTTPS. */
export function setSetupCookie(ctx: GenericEndpointContext, token: string, maxAge: number): void {
  ctx.setCookie(SETUP_COOKIE, token, {
    ...ctx.context.authCookies.sessionToken.attributes,
    maxAge,
  });
}
