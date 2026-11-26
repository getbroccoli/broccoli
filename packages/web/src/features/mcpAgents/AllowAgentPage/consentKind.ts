/** Granted when the agent asks to change things, such as asking for leave. */
export const WRITE_SCOPE = "broccoli:write";

/** What allowing this agent does to the person's connection. */
export type ConsentKind =
  "FIRST_CONNECTION" | "SAME_AGENT_AGAIN" | "SAME_AGENT_WIDENING" | "REPLACING_ANOTHER_AGENT";

/** Whether the agent asking connects first, comes back, asks to change things, or replaces another. */
export function consentKind({
  clientId,
  scopes,
  current,
}: {
  clientId: string;
  scopes: ReadonlySet<string>;
  current: { clientId: string; canChangeThings: boolean } | null;
}): ConsentKind {
  if (!current) {
    return "FIRST_CONNECTION";
  }
  if (current.clientId !== clientId) {
    return "REPLACING_ANOTHER_AGENT";
  }
  return scopes.has(WRITE_SCOPE) && !current.canChangeThings
    ? "SAME_AGENT_WIDENING"
    : "SAME_AGENT_AGAIN";
}
