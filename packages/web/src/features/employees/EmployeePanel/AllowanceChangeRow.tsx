import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import {
  type AllowanceChange,
  changeTitle,
  figureLines,
  recordedDate,
  signedDays,
} from "./allowanceHistoryText";

type Props = {
  change: AllowanceChange;
  /** The next older change, whose figures this one moved from. */
  previous: AllowanceChange | undefined;
  readerUserId: string;
  today: string;
  /** Set when the reader may reverse this adjustment. */
  onReverse?: (adjustmentId: string | null) => void;
};

/** One change: what happened, its amount and the days left, and how each figure moved. */
export function AllowanceChangeRow({ change, previous, readerUserId, today, onReverse }: Props) {
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{recordedDate(change.recordedAt, today)}</span>
      <span className="flex min-w-0 flex-col items-start">
        <span className="flex flex-wrap items-center gap-x-2">
          {changeTitle(change, readerUserId)}
          {change.reversed && (
            <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
              {t("people.panel.timeOff.history.reversedTag")}
            </span>
          )}
        </span>
        {change.comment && (
          <span className="text-muted-foreground break-words">{change.comment}</span>
        )}
        {onReverse && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            aria-label={t("people.panel.timeOff.reverse.openLabel", {
              amount: signedDays(change.amount),
              date: recordedDate(change.recordedAt, today),
            })}
            onClick={() => onReverse(change.adjustmentId)}
          >
            {t("people.panel.timeOff.reverse.open")}
          </Button>
        )}
      </span>
      <span className="flex flex-col items-end">
        <span className="font-medium tabular-nums">{signedDays(change.amount)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("people.panel.timeOff.history.left", { days: formatDays(change.balanceAfter) })}
        </span>
      </span>
      {figureLines(change, previous).map(({ text, amount }) => (
        <Fragment key={text}>
          <span className="col-start-2 text-xs text-muted-foreground">{text}</span>
          <span className="text-right text-xs text-muted-foreground tabular-nums">{amount}</span>
        </Fragment>
      ))}
    </li>
  );
}
