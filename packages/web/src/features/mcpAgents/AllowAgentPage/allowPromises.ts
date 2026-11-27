import type { MessageKey } from "@/i18n";

import { WRITE_SCOPE } from "./consentKind";

/** What the Allow page promises about an agent asking for these scopes; it never decides alone. */
export function allowPromises(scopes: ReadonlySet<string>): MessageKey[] {
  return [
    "mcpAgents.allow.reads",
    ...(scopes.has(WRITE_SCOPE)
      ? (["mcpAgents.allow.asksForLeave", "mcpAgents.allow.youDecide"] as const)
      : (["mcpAgents.allow.neverApproves"] as const)),
    "mcpAgents.allow.disconnect",
  ];
}
