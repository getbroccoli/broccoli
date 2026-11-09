import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import { RecordHistoryDocument, type RecordType } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { groupByDay, HISTORY_PAGE_SIZE, type HistoryLine } from "./historyLines";
import { HistoryRow } from "./HistoryRow";
import type { RecordDescription } from "../recordDescription";

type Props = {
  recordType: RecordType;
  recordId: string;
  description: RecordDescription;
  /** Only the lines changing at least one, or none, of these fields; the server filters, as it pages. */
  filter?: { changingAnyOf?: string[]; changingNoneOf?: string[] };
  /** A short tag on each line, such as the part of the record it changes. */
  tagOf?: (line: HistoryLine) => string | null;
  /** False where a tab already names the history. */
  titled?: boolean;
};

/**
 * A record's history, newest first and grouped by day, for any record type: it loads its lines
 * itself, so a record's panel only says which record and how its fields read.
 */
export function RecordHistory({
  recordType,
  recordId,
  description,
  filter,
  tagOf,
  titled = true,
}: Props) {
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const { data, error, refetch, fetchMore } = useQuery(RecordHistoryDocument, {
    variables: { recordType, recordId, first: HISTORY_PAGE_SIZE, ...filter },
    // A save adds its line only to the unfiltered history; a filtered one reloads when shown.
    fetchPolicy: filter ? "cache-and-network" : "cache-first",
  });
  const history = data?.recordHistory;

  const loadOlder = async (after: string) => {
    setLoadingOlder(true);
    setOlderFailed(false);
    try {
      await fetchMore({
        variables: { after },
        // A save meanwhile refreshed the first page; this older page no longer follows it.
        updateQuery: (current, { fetchMoreResult }) =>
          current.recordHistory.pageInfo.endCursor === after
            ? {
                recordHistory: {
                  ...fetchMoreResult.recordHistory,
                  edges: [...current.recordHistory.edges, ...fetchMoreResult.recordHistory.edges],
                },
              }
            : current,
      });
    } catch {
      setOlderFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <section
      aria-labelledby={titled ? "record-history" : undefined}
      className="flex flex-col gap-2"
    >
      {titled && (
        <h2
          id="record-history"
          className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
        >
          {t("records.history.title")}
        </h2>
      )}
      {(error || olderFailed) && (
        <div role="alert" className="flex items-center gap-3 text-sm text-muted-foreground">
          {t("records.history.error")}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              olderFailed && history?.pageInfo.endCursor
                ? void loadOlder(history.pageInfo.endCursor)
                : void refetch()
            }
          >
            {t("records.history.retry")}
          </Button>
        </div>
      )}
      {history?.edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(filter ? "records.history.emptyFiltered" : "records.history.empty")}
        </p>
      ) : (
        history && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {groupByDay(
              history.edges.map(({ node }) => node),
              new Date(),
            ).map((group) => (
              <div key={group.label}>
                <div className="border-b border-border/60 bg-sidebar px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                <ul>
                  {group.lines.map((line) => (
                    <HistoryRow
                      key={line.id}
                      line={line}
                      description={description}
                      tag={tagOf?.(line) ?? null}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      )}
      {history?.pageInfo.hasNextPage && history.pageInfo.endCursor && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={loadingOlder}
          onClick={() => void loadOlder(history.pageInfo.endCursor!)}
        >
          {t("records.history.older")}
        </Button>
      )}
    </section>
  );
}
