import { useQuery } from "@apollo/client/react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useState } from "react";

import { RecordHistoryDocument, type RecordType } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import {
  authorName,
  causeLabel,
  groupByDay,
  type HistoryLine,
  type Summary,
  summaryOf,
} from "./historyLines";
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

function HistoryRow({ line, description }: { line: HistoryLine; description: RecordDescription }) {
  const [open, setOpen] = useState(false);
  const summary = summaryOf(line, description);
  const expandable = summary.kind === "updatedMany" || summary.kind === "created";
  const author = authorName(line.author);

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
        <span
          aria-hidden
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
            line.author.kind === "SIGNED_IN_USER"
              ? "avatar-tint text-white"
              : "bg-brand-soft text-brand-deep",
          )}
        >
          {line.author.kind === "SIGNED_IN_USER"
            ? author.slice(0, 2).toUpperCase()
            : author.charAt(0)}
        </span>
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium">{author}</span> <SummaryText summary={summary} />
          {line.reason && <span className="text-muted-foreground"> · “{line.reason}”</span>}
        </p>
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {causeLabel(line.cause.kind)}
        </span>
        <time
          dateTime={line.occurredAt}
          className="w-11 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
        >
          {TIME.format(new Date(line.occurredAt))}
        </time>
        {expandable ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={open}
            aria-label={t(open ? "records.history.hideChanges" : "records.history.showChanges")}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <CaretUp /> : <CaretDown />}
          </Button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
      </div>
      {expandable && open && (
        <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-12 pb-3 text-[13px]">
          {line.changes.map((change) => {
            const field = description.fields.find(({ key }) => key === change.field);
            const show = (value: string) => field?.format(value) ?? value;
            return (
              <div key={change.field} className="contents">
                <dt className="text-muted-foreground">{field?.label ?? change.field}</dt>
                <dd className="min-w-0 break-words">
                  <Values
                    oldValue={change.oldValue && show(change.oldValue)}
                    newValue={change.newValue && show(change.newValue)}
                  />
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </li>
  );
}

function SummaryText({ summary }: { summary: Summary }) {
  switch (summary.kind) {
    case "changed":
      if (summary.newValue === null) {
        return <>{t("records.history.cleared", { field: lower(summary.label) })}</>;
      }
      return (
        <>
          {summary.oldValue === null
            ? t("records.history.set", { field: lower(summary.label) })
            : t("records.history.changed", { field: lower(summary.label) })}{" "}
          <Values oldValue={summary.oldValue} newValue={summary.newValue} />
        </>
      );
    case "updatedMany":
      return (
        <>
          {t("records.history.updatedMany", { count: String(summary.labels.length) })}{" "}
          <span className="text-muted-foreground">{summary.labels.join(", ")}</span>
        </>
      );
    case "created":
      return (
        <>
          {summary.title
            ? t("records.history.created", {
                title: summary.title,
                count: String(summary.labels.length),
              })
            : t("records.history.createdUntitled", { count: String(summary.labels.length) })}{" "}
          <span className="text-muted-foreground">{summary.labels.join(", ")}</span>
        </>
      );
    case "deleted":
      return (
        <>
          {summary.title
            ? t("records.history.deleted", { title: summary.title })
            : t("records.history.deletedUntitled")}
        </>
      );
  }
}

function Values({ oldValue, newValue }: { oldValue: string | null; newValue: string | null }) {
  return (
    <>
      {oldValue !== null && (
        <>
          <del className="text-muted-foreground">{oldValue}</del>
          <span aria-hidden className="text-muted-foreground">
            {" → "}
          </span>
        </>
      )}
      {newValue !== null && <ins className="font-medium no-underline">{newValue}</ins>}
    </>
  );
}

/** "Job title" as "job title", inside a sentence. */
function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

const PAGE_SIZE = 50;

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
