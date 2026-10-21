/** The name an agent gives itself: printable characters, at most 60, else "Your agent". */
export function parseExternalAgentClientName(client: unknown): string {
  const printable =
    typeof client === "string" ? client.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").trim() : "";
  return printable.slice(0, MAX_CLIENT_LENGTH) || "Your agent";
}

const MAX_CLIENT_LENGTH = 60;
