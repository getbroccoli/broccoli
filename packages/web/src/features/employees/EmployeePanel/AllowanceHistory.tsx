import { useQuery } from "@apollo/client/react";
import { Fragment, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";

import { AllowanceHistoryDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { companyToday } from "@/features/termsDisplay";
import { formatDays } from "@/lib/formatDays";

import {
  type AllowanceChange,
  changeTitle,
  figureLines,
  recordedDate,
  signedDays,
} from "./allowanceHistoryText";
import { ReverseAdjustmentDialog } from "./ReverseAdjustmentDialog";

type Props = {
  employeeId: string;
  allowanceId: string;
  /** Set for who may adjust the balance, to reverse an adjustment: whose it is. */
  reverseFor?: { firstName: string; isReader: boolean };
};

/** A balance's changes, newest first, each with what it did and the days left after it. */
export function AllowanceHistory({ employeeId, allowanceId, reverseFor }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Bookings and adjustments made while it was closed change it, so each open asks again.
  const { data, error, loading, refetch } = useQuery(AllowanceHistoryDocument, {
    variables: { employeeId },
    fetchPolicy: "cache-and-network",
  });
  const today = companyToday();
  const changes =
    data?.employee?.timeOffTypes?.find((type) => type.allowanceId === allowanceId)?.history ?? [];

  // Resolved against the latest history, so a refresh that marks it reversed retires the dialog.
  const reversing =
    reversingId === null
      ? undefined
      : changes.find((change) => change.adjustmentId === reversingId && isReversible(change));

  if (loading && !data) {
    return (
      <p className="px-3 pb-2.5 text-sm text-muted-foreground">
        {t("people.panel.timeOff.history.loading")}
      </p>
    );
  }
  if (error && !data) {
    return (
      <p role="alert" className="flex items-center gap-2 px-3 pb-2.5 text-sm text-muted-foreground">
        {t("people.panel.timeOff.history.failed")}
        <Button variant="ghost" size="sm" onClick={() => void refetch()}>
          {t("people.panel.timeOff.history.retry")}
        </Button>
      </p>
    );
  }
  const shown = showAll ? changes : changes.slice(0, FIRST_SHOWN);
  return (
    <>
      <ol className="flex flex-col border-t border-border/60">
        {shown.map((change, index) => (
          <ChangeRow
            key={`${change.recordedAt}:${change.cause}:${index}`}
            change={change}
            previous={changes[index + 1]}
            readerUserId={me.id}
            today={today}
            onReverse={reverseFor && isReversible(change) ? setReversingId : undefined}
          />
        ))}
      </ol>
      {!showAll && changes.length > FIRST_SHOWN && (
        <div className="border-t border-border/60 px-1.5 py-1.5">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            {t("people.panel.timeOff.history.showAll", { count: String(changes.length) })}
          </Button>
        </div>
      )}
      {reversing && reverseFor && (
        <ReverseAdjustmentDialog
          adjustment={reversing}
          // The newest change's balance came with this history, so the two always agree.
          balance={{ ...reverseFor, remaining: changes[0]!.balanceAfter }}
          today={today}
          onRefused={() => void refetch()}
          onClose={() => setReversingId(null)}
        />
      )}
    </>
  );
}

type ChangeRowProps = {
  change: AllowanceChange;
  /** The next older change, whose figures this one moved from. */
  previous: AllowanceChange | undefined;
  readerUserId: string;
  today: string;
  /** Set when the reader may reverse this adjustment. */
  onReverse?: (adjustmentId: string | null) => void;
};

/** One change: what happened, its amount and the days left, and how each figure moved. */
function ChangeRow({ change, previous, readerUserId, today, onReverse }: ChangeRowProps) {
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

/** The newest changes shown before Show all. */
const FIRST_SHOWN = 5;

/** An adjustment nobody has reversed yet; a reversal itself can't be reversed. */
function isReversible(change: AllowanceChange): boolean {
  return change.cause === "ALLOWANCE_ADJUSTED" && change.adjustmentId !== null && !change.reversed;
}
