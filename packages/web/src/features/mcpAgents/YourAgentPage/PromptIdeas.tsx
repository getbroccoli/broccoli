import { t, type MessageKey } from "@/i18n";

import { PromptIdea } from "./PromptIdea";

// Only what the agent's tools answer today: leave, asking for it, and tasks.
const PROMPTS: readonly MessageKey[] = [
  "mcpAgents.prompts.balance",
  "mcpAgents.prompts.askForLeave",
  "mcpAgents.prompts.tasks",
];

/** Prompts to paste into a connected agent, so the person sees it work. */
export function PromptIdeas() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("mcpAgents.prompts.title")}</span>
      <ul className="contents">
        {PROMPTS.map((key) => (
          <PromptIdea key={key} text={t(key)} />
        ))}
      </ul>
    </div>
  );
}
