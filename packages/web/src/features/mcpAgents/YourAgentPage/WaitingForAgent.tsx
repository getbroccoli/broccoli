import { t } from "@/i18n";

import "./waitingForAgent.css";

/** Shown until the person's agent connects; the page checks again when they come back to it. */
export function WaitingForAgent() {
  return (
    <p role="status" className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <span aria-hidden className="waiting-for-agent-pulse size-2 shrink-0 rounded-full bg-brand" />
      {t("mcpAgents.waiting")}
    </p>
  );
}
