import { t } from "@/i18n";

import "./waitingForAgent.css";

/** Shown until the person's agent connects; the page checks again when they come back to it. */
export function WaitingForAgent() {
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl bg-app-backdrop px-4 py-3">
      <span
        aria-hidden
        className="waiting-for-agent-pulse size-2.5 shrink-0 rounded-full bg-brand"
      />
      <span className="flex flex-col text-sm">
        <span className="font-medium">{t("mcpAgents.waiting.title")}</span>
        <span className="text-muted-foreground">{t("mcpAgents.waiting.detail")}</span>
      </span>
    </div>
  );
}
