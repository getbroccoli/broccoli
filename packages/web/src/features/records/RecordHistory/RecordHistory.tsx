import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import { RecordHistoryDocument, type RecordType } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { groupByDay } from "./historyLines";
import { HistoryRow } from "./HistoryRow";
import type { RecordDescription } from "./recordDescription";

type Props = {
  recordType: RecordType;
  recordId: string;
  description: RecordDescription;
};

/**
 * A record's history, newest first and grouped by day, for any record type: it loads its lines
 * itself, so a record's panel only says which record and how its fields read.
 */
export function RecordHistory({ recordType, recordId, description }: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, previousData, error, loading, refetch } = useQuery(RecordHistoryDocument, {
    variables: { recordType, recordId, first: limit },
  });
  const history = (data ?? previousData)?.recordHistory;

  return (
    <section aria-labelledby="record-history" className="flex flex-col gap-2">
      <h2
        id="record-history"
        className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
      >
        {t("records.history.title")}
      </h2>
      {error && !history ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-muted-foreground">
          {t("records.history.error")}
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("records.history.retry")}
          </Button>
        </div>
      ) : history?.edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("records.history.empty")}</p>
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
                    <HistoryRow key={line.id} line={line} description={description} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      )}
      {history?.pageInfo.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={loading}
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
        >
          {t("records.history.older")}
        </Button>
      )}
    </section>
  );
}

const PAGE_SIZE = 50;
