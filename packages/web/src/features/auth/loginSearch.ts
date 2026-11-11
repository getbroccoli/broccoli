import { z } from "zod";

/** Where sign-in leads without a usable `redirect`. */
export const DEFAULT_REDIRECT = "/tasks";

/**
 * `raw` as a path on `origin` (path, query and hash), or `DEFAULT_REDIRECT` when it
 * could lead elsewhere: another site, a script URL, or back to the login page.
 */
export function toLocalPath(raw: string, origin: string): string {
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    hasControlCharacter(raw)
  ) {
    return DEFAULT_REDIRECT;
  }
  const url = new URL(raw, origin);
  // Checked after parsing, which resolves dot segments: `/a/..//x` becomes `//x`.
  if (url.origin !== origin || url.pathname.startsWith("//") || isLoginPath(url.pathname)) {
    return DEFAULT_REDIRECT;
  }
  return url.pathname + url.search + url.hash;
}

function hasControlCharacter(text: string): boolean {
  return [...text].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

/** Why a managed sign-in came back to the login page; set by the API's callback. */
export const SIGN_IN_ERRORS = ["sign_in_required", "sign_in_unavailable"] as const;

export type SignInError = (typeof SIGN_IN_ERRORS)[number];

/**
 * The search params of `/login`: where to go after signing in, always a local path, and
 * why a managed sign-in failed, if it did.
 */
export const loginSearch = z.preprocess(
  withAgentAuthorizeRedirect,
  z.object({
    redirect: z
      .string()
      .transform((raw) => toLocalPath(raw, window.location.origin))
      .catch(DEFAULT_REDIRECT),
    error: z.enum(SIGN_IN_ERRORS).optional().catch(undefined),
    /** Set after a password reset, so the page says the new password works. */
    reset: z.literal("done").optional().catch(undefined),
  }),
);

export type LoginSearch = z.infer<typeof loginSearch>;

/** Where the API's agent authorization sends a signed-out browser: `/login` with the request. */
const AGENT_AUTHORIZE_PATH = "/api/auth/oauth2/authorize";

/**
 * The OAuth server's signature and expiry over the request, which the authorize endpoint does not
 * take back, and the prompt that asked for this sign-in, which would ask again.
 */
const NOT_AUTHORIZE_PARAMETERS = new Set(["exp", "ba_iat", "ba_param", "ba_pl", "sig", "prompt"]);

/**
 * An agent's authorize request that sent the person here to sign in becomes the redirect, so
 * signing in resumes it: the authorize endpoint then asks them to allow the agent.
 */
function withAgentAuthorizeRedirect(search: unknown): unknown {
  const raw = (search ?? {}) as Record<string, unknown>;
  if (raw.response_type === undefined || raw.client_id === undefined) {
    return search;
  }
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(raw)) {
    if (!NOT_AUTHORIZE_PARAMETERS.has(name)) {
      for (const each of Array.isArray(value) ? value : [value]) {
        query.append(name, String(each));
      }
    }
  }
  return { redirect: `${AGENT_AUTHORIZE_PATH}?${query.toString()}` };
}
