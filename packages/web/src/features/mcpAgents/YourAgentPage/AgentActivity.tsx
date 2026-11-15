import { useQuery } from "@apollo/client/react";
import { useEffect, useReducer, useState } from "react";

import { YourAgentActivityDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";

import "./agentActivity.css";
import { AgentActivityLine } from "./AgentActivityLine";
import { PromptIdeas } from "./PromptIdeas";

/** How often the lines' times ("12 seconds ago") read again. */
const TICK_MS = 1_000;

type Props = { client: string };

/**
 * The calls the person's agent makes while the page is open, newest first, each as it happens;
 * calls from before the page opened stay out. The shell's live stream reads the list again on each call.
 * shortcut: shows a visit's newest 50 calls; page back to the opening once history pages this list.
 */
export function AgentActivity({ client }: Props) {
  const { data } = useQuery(YourAgentActivityDocument, { fetchPolicy: "network-only" });
  const lines = data?.myAgentActivity.edges.map(({ node }) => node);
  const [openedAt] = useState(Date.now);
  // The lines the first read finds from before the page opened; any later line is live.
  const [earlierIds, setEarlierIds] = useState<ReadonlySet<string>>();
  if (lines && !earlierIds) {
    setEarlierIds(
      new Set(lines.filter(({ calledAt }) => Date.parse(calledAt) < openedAt).map(({ id }) => id)),
    );
  }
  useTicking();
  const liveLines = earlierIds ? (lines ?? []).filter(({ id }) => !earlierIds.has(id)) : [];

  return (
    <section aria-labelledby="agent-activity" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <h2 id="agent-activity" className="text-[15px] font-semibold">
          {t("mcpAgents.activity.title", { client })}
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
          {/* Remounts on each new line, so it pulses once. */}
          <span
            key={liveLines[0]?.id}
            aria-hidden
            className="agent-activity-pulse size-1.5 rounded-full bg-brand"
          />
          {t("mcpAgents.activity.live")}
        </span>
      </div>
      {liveLines.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed p-5">
          <p className="text-sm">{t("mcpAgents.activity.empty", { client })}</p>
          <PromptIdeas />
        </div>
      ) : (
        <>
          <div className="max-h-[340px] overflow-y-auto overscroll-contain rounded-2xl border">
            <ol aria-live="polite" className="divide-y">
              {liveLines.map((line) => (
                <AgentActivityLine key={line.id} line={line} />
              ))}
            </ol>
          </div>
          <PromptIdeas />
        </>
      )}
    </section>
  );
}

/** Renders the component again every second, so the lines' times keep up. */
function useTicking(): void {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
}
