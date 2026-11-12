import { postJson } from "@/lib/postJson";

/** The name the agent's app gave itself when it registered; null when it gave none or is unknown. */
export async function readAgentClientName(clientId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `/api/auth/oauth2/public-client?${new URLSearchParams({ client_id: clientId }).toString()}`,
    );
    if (!response.ok) return null;
    const { client_name: name } = (await response.json()) as { client_name?: unknown };
    return typeof name === "string" && name.trim() !== "" ? name : null;
  } catch {
    return null;
  }
}

/** How answering the agent ended: where to send the browser back to it, or why not. */
export type AgentAnswer = { returnTo: string } | "expired" | "failed";

/**
 * Allows or refuses the agent's request, signed by Broccoli in the page's query. Either way the
 * agent learns the answer at the address it gave, which the browser goes to next.
 */
export async function answerAgent(allow: boolean, signedRequest: string): Promise<AgentAnswer> {
  try {
    const response = await postJson("/api/auth/oauth2/consent", {
      accept: allow,
      oauth_query: signedRequest,
    });
    // A request older than its signature's lifetime, or one that was changed, is refused as bad.
    if (response.status === 400) return "expired";
    if (!response.ok) return "failed";
    const { url } = (await response.json()) as { url?: unknown };
    return typeof url === "string" ? { returnTo: url } : "failed";
  } catch {
    return "failed";
  }
}
