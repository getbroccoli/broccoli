import type { AgentConnectionEndReason } from "@/__generated__/graphql";
import { t, type MessageKey } from "@/i18n";

/** Replacement never shows: the page then shows the agent that replaced it as connected. */
const ENDINGS: Partial<Record<AgentConnectionEndReason, MessageKey>> = {
  DISCONNECTED_BY_PERSON: "mcpAgents.ended.disconnected",
  ENDED_BY_PASSWORD_RESET: "mcpAgents.ended.passwordReset",
  ENDED_AFTER_30_DAYS_UNUSED: "mcpAgents.ended.unused",
};

type Props = {
  ending: { clientName?: string | null; reason: AgentConnectionEndReason };
};

/** That no agent is connected, and why the last one ended. */
export function LastEndingNote({ ending }: Props) {
  const why = ENDINGS[ending.reason];
  if (!why) return null;
  return (
    <div role="status" className="flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-sm">
      <span className="font-medium">{t("mcpAgents.ended.title")}</span>
      <span className="text-muted-foreground">
        {t(why, { client: ending.clientName ?? t("mcpAgents.unnamedClient") })}{" "}
        {t("mcpAgents.ended.again")}
      </span>
    </div>
  );
}
