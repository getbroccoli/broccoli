import { NetworkStatus } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { useEffect, useRef, useState } from "react";

import { YourAgentActivityHistoryDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { agentActivityLabel } from "../agentActivityLabel";
import { dateAndTime } from "./dateAndTime";
import { OutcomeBadge } from "./OutcomeBadge";

type Props = {
  /** When the page opened, in milliseconds; calls since then are live, not history. */
  openedAt: number;
};

/**
 * The person's earlier agent calls of the last 30 days, of every agent they connected, newest
 * first; the next page loads as the person scrolls to the end.
 */
export function AgentActivityHistory({ openedAt }: Props) {
  const { data, error, fetchMore, networkStatus } = useQuery(YourAgentActivityHistoryDocument, {
    fetchPolicy: "network-only",
  });
  const [moreFailed, setMoreFailed] = useState(false);
  const history = data?.myAgentActivity;
  const lines = history?.edges
    .map(({ node }) => node)
    .filter(({ calledAt }) => Date.parse(calledAt) < openedAt);
  const loadingMore = networkStatus === NetworkStatus.fetchMore;
  const endCursor = history?.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;

  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = end.current;
    if (!element || !endCursor || loadingMore || moreFailed) return;
    const loadMore = async () => {
      try {
        await fetchMore({
          variables: { after: endCursor },
          updateQuery: (current, { fetchMoreResult }) => ({
            myAgentActivity: {
              ...fetchMoreResult.myAgentActivity,
              edges: [...current.myAgentActivity.edges, ...fetchMoreResult.myAgentActivity.edges],
            },
          }),
        });
      } catch {
        setMoreFailed(true);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void loadMore();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [endCursor, fetchMore, loadingMore, moreFailed]);

  return (
    <>
      <div className="sticky top-0 border-y bg-muted px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t("mcpAgents.activity.earlier")}
      </div>
      {lines && lines.length > 0 && (
        <ol className="divide-y bg-muted/40">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]"
            >
              <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                {dateAndTime(line.calledAt)}
              </span>
              <span className="min-w-40 flex-1">{agentActivityLabel(line)}</span>
              <OutcomeBadge outcome={line.outcome} />
              <span className="ml-auto max-w-28 shrink-0 truncate text-right text-muted-foreground">
                {line.clientName ?? t("mcpAgents.unnamedClient")}
              </span>
            </li>
          ))}
        </ol>
      )}
      {lines?.length === 0 && !endCursor && (
        <p className="px-4 py-2 text-[13px] text-muted-foreground">
          {t("mcpAgents.activity.noEarlier")}
        </p>
      )}
      {(error || moreFailed) && (
        <p className="px-4 py-2 text-[13px] text-muted-foreground">
          {t("mcpAgents.activity.historyFailed")}
        </p>
      )}
      <div ref={end} aria-hidden className="h-px" />
    </>
  );
}
