import { useQuery } from "@apollo/client/react";
import { useEffect, useReducer, useState } from "react";

import { YourAgentActivityDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import "./agentActivity.css";
import { AgentActivityHistory } from "./AgentActivityHistory";
import { AgentActivityLine } from "./AgentActivityLine";
import { PromptIdeas } from "./PromptIdeas";

/** How often the lines' times ("12 seconds ago") read again. */
const TICK_MS = 1_000;

type Props = {
  client: string;
  /** When the agent connected; an agent that replaced another lists only its own calls. */
  connectedAt: string;
  /** When the page opened, in milliseconds. */
  openedAt: number;
};

/**
 * The calls the person's agent makes while the page is open, newest first, each as it happens;
 * calls from before the page opened show only under Show history. The shell's live stream reads the
 * list again on each call.
 * shortcut: the live list keeps a visit's newest 50 calls; page it too if a visit ever makes more.
 */
export function AgentActivity({ client, connectedAt, openedAt }: Props) {
  const { data, error } = useQuery(YourAgentActivityDocument, { fetchPolicy: "network-only" });
  const lines = data?.myAgentActivity.edges.map(({ node }) => node);
  // The lines the first read finds from before the page opened; any later line is live.
  const [earlierIds, setEarlierIds] = useState<ReadonlySet<string>>();
  if (lines && !earlierIds) {
    setEarlierIds(
      new Set(lines.filter(({ calledAt }) => Date.parse(calledAt) < openedAt).map(({ id }) => id)),
    );
  }
  const [historyShown, setHistoryShown] = useState(false);
  useTicking();
  const liveLines = earlierIds
    ? (lines ?? []).filter(({ id, calledAt }) => !earlierIds.has(id) && calledAt >= connectedAt)
    : [];

  return (
    <section aria-labelledby="agent-activity" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <h2 id="agent-activity" className="text-[15px] font-semibold">
          {t("mcpAgents.activity.title", { client })}
        </h2>
        {data && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
            {/* Remounts on each new line, so it pulses once. */}
            <span
              key={liveLines[0]?.id}
              aria-hidden
              className="agent-activity-pulse size-1.5 rounded-full bg-brand"
            />
            {t("mcpAgents.activity.live")}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={historyShown}
          onClick={() => setHistoryShown(!historyShown)}
        >
          {t(historyShown ? "mcpAgents.activity.hideHistory" : "mcpAgents.activity.showHistory")}
        </Button>
      </div>
      {error && !data ? (
        <p role="alert" className="text-sm text-destructive">
          {t("mcpAgents.activity.loadFailed")}
        </p>
      ) : (
        liveLines.length === 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed p-5">
            <p className="text-sm">{t("mcpAgents.activity.empty", { client })}</p>
            <PromptIdeas />
          </div>
        )
      )}
      {(liveLines.length > 0 || historyShown) && (
        <div className="max-h-[340px] overflow-y-auto overscroll-contain rounded-2xl border">
          {liveLines.length > 0 && (
            <ol aria-live="polite" className="divide-y">
              {liveLines.map((line) => (
                <AgentActivityLine key={line.id} line={line} />
              ))}
            </ol>
          )}
          {historyShown && <AgentActivityHistory openedAt={openedAt} />}
        </div>
      )}
      {liveLines.length > 0 && <PromptIdeas />}
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
