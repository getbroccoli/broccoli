import { z } from "zod";

/** Where sign-in leads without a usable `redirect`. */
export const DEFAULT_REDIRECT = "/people";

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

/** The search params of `/login`: where to go after signing in, always a local path. */
export const loginSearch = z.object({
  redirect: z
    .string()
    .transform((raw) => toLocalPath(raw, window.location.origin))
    .catch(DEFAULT_REDIRECT),
});

export type LoginSearch = z.infer<typeof loginSearch>;
