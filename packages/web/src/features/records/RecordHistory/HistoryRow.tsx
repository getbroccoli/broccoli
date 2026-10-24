import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { authorName, causeLabel, type HistoryLine, summaryOf } from "./historyLines";
import type { RecordDescription } from "../recordDescription";
import { ChangeValues } from "./ChangeValues";
import { SummaryText } from "./SummaryText";

type Props = {
  line: HistoryLine;
  description: RecordDescription;
};

/** One history line: who, what, cause and time; a line of several changes expands to each of them. */
export function HistoryRow({ line, description }: Props) {
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
        <p className="min-w-0 flex-1 break-words">
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
                  <ChangeValues
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

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
