import { parseCookies } from "better-auth/cookies";

/** The cookie that carries the setup holder's token. */
export const SETUP_COOKIE = "broccoli_setup";

/** The setup token a request carries, or null. */
export function readSetupToken(cookieHeader: string | undefined): string | null {
  return (cookieHeader && parseCookies(cookieHeader).get(SETUP_COOKIE)) || null;
}
