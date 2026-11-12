import { t, type MessageKey } from "@/i18n";

import { PromptIdea } from "./PromptIdea";

// Only what the agent's tools answer today: the person, their manager, and people by name or email.
const PROMPTS: readonly MessageKey[] = [
  "mcpAgents.prompts.manager",
  "mcpAgents.prompts.email",
  "mcpAgents.prompts.jobTitles",
  "mcpAgents.prompts.hello",
];

/** Prompts to paste into a connected agent, so the person sees it work. */
export function PromptIdeas({ client }: { client: string }) {
  return (
    <section aria-labelledby="prompt-ideas" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="prompt-ideas" className="text-[15px] font-semibold">
          {t("mcpAgents.prompts.title", { client })}
        </h2>
        <span className="text-xs text-muted-foreground">{t("mcpAgents.prompts.scope")}</span>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {PROMPTS.map((key) => (
          <PromptIdea key={key} text={t(key)} />
        ))}
      </ul>
    </section>
  );
}
