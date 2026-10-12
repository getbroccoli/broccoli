const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `raw` as a canonical origin (`https://host[:port]`, no trailing slash), or null when
 * it has a path, query, fragment or credentials. Plain http is allowed only on
 * loopback hosts, for local tests.
 */
export function parseOrigin(raw: string): string | null {
  if (!URL.canParse(raw)) {
    return null;
  }
  const url = new URL(raw);
  const isSecure =
    url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
  const isBare =
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "";
  return isSecure && isBare ? url.origin : null;
}
