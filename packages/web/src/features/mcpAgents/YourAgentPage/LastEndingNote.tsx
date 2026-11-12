import type { AgentConnectionEndReason, YourAgentQuery } from "@/__generated__/graphql";
import { t, type MessageKey } from "@/i18n";

/** Replacement never shows: the page then shows the agent that replaced it as connected. */
const ENDINGS: Partial<Record<AgentConnectionEndReason, MessageKey>> = {
  DISCONNECTED_BY_PERSON: "mcpAgents.ended.disconnected",
  ENDED_BY_PASSWORD_RESET: "mcpAgents.ended.passwordReset",
  ENDED_AFTER_30_DAYS_UNUSED: "mcpAgents.ended.unused",
};

type Props = {
  ending: NonNullable<YourAgentQuery["myLastEndedAgentConnection"]>;
};

/** Why the person's last agent connection ended. */
export function LastEndingNote({ ending }: Props) {
  const why = ENDINGS[ending.reason];
  if (!why) return null;
  return (
    <p role="status" className="rounded-xl bg-app-backdrop px-4 py-3 text-sm">
      {t(why, { client: ending.clientName ?? t("mcpAgents.unnamedClient") })}
    </p>
  );
}
