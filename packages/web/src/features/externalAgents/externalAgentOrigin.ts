/**
 * Whether the page may show an agent one-time code at this origin: one on https, or on this
 * computer, since the code and the agent's token travel to that address.
 */
export function isExternalAgentSafeOrigin(origin: string | null): boolean {
  if (origin === null || !URL.canParse(origin)) {
    return false;
  }
  const { protocol, hostname } = new URL(origin);
  return protocol === "https:" || (protocol === "http:" && LOOPBACK_HOSTS.has(hostname));
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
