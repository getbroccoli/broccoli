import { t } from "@/i18n";

/** Your agent comes later; it shows what is coming but cannot be chosen yet. */
export function AgentOption() {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border px-4 py-3.5 opacity-60">
      <input
        id="ai-source-agent"
        type="radio"
        name="source"
        disabled
        className="size-4 shrink-0"
        aria-describedby="ai-source-agent-soon"
      />
      <label htmlFor="ai-source-agent" className="flex flex-1 flex-col">
        <span className="text-[15px] font-medium">{t("setup.ai.agent")}</span>
        <span className="text-sm text-muted-foreground">{t("setup.ai.agentHint")}</span>
      </label>
      <span
        id="ai-source-agent-soon"
        className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
      >
        {t("setup.ai.comingSoon")}
      </span>
    </div>
  );
}
