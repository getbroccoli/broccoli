/** `path` under `base`; `new URL` would drop the last path segment of a base without a trailing slash. */
export function urlUnder(base: string, path: string): URL {
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}
