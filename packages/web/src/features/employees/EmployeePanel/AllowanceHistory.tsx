import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { useRouteContext } from "@tanstack/react-router";

import { AllowanceHistoryDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { type AllowanceChange, changeTitle, partsLine, signedDays } from "./allowanceHistoryText";
import { ReverseAdjustmentDialog } from "./ReverseAdjustmentDialog";

type Props = {
  employeeId: string;
  allowanceId: string;
  /** Set for who may adjust the balance: its remaining days and whose it is, to reverse an adjustment. */
  reverseFor?: { remaining: number; firstName: string; isReader: boolean };
};

const recordedDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const recordedDayWithYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A balance's changes, newest first, each with what it did and the days left after it. */
export function AllowanceHistory({ employeeId, allowanceId, reverseFor }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const [reversing, setReversing] = useState<AllowanceChange | null>(null);
  // Bookings and adjustments made while it was closed change it, so each open asks again.
  const { data, error, loading, refetch } = useQuery(AllowanceHistoryDocument, {
    variables: { employeeId },
    fetchPolicy: "cache-and-network",
  });
  const changes =
    data?.employee?.timeOffTypes?.find((type) => type.allowanceId === allowanceId)?.history ?? [];

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
  return (
    <>
      <ol className="flex flex-col border-t border-border/60">
        {changes.map((change, index) => {
          const parts = partsLine(change);
          return (
            <li
              key={`${change.recordedAt}:${change.cause}:${index}`}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0"
            >
              <span className="text-muted-foreground">{recordedDate(change.recordedAt)}</span>
              <span className="flex min-w-0 flex-col items-start">
                <span className="flex flex-wrap items-center gap-x-2">
                  {changeTitle(change, me.id)}
                  {change.reversed && (
                    <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
                      {t("people.panel.timeOff.history.reversedTag")}
                    </span>
                  )}
                </span>
                {change.comment && (
                  <span className="text-muted-foreground break-words">{change.comment}</span>
                )}
                {parts && <span className="text-xs text-muted-foreground">{parts}</span>}
                {reverseFor && change.cause === "ALLOWANCE_ADJUSTED" && !change.reversed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    aria-label={t("people.panel.timeOff.reverse.openLabel", {
                      amount: signedDays(change.amount),
                    })}
                    onClick={() => setReversing(change)}
                  >
                    {t("people.panel.timeOff.reverse.open")}
                  </Button>
                )}
              </span>
              <span className="flex flex-col items-end">
                <span className="font-medium tabular-nums">{signedDays(change.amount)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("people.panel.timeOff.history.left", {
                    days: formatDays(change.balanceAfter),
                  })}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {reversing && reverseFor && (
        <ReverseAdjustmentDialog
          adjustment={reversing}
          balance={reverseFor}
          onClose={() => setReversing(null)}
        />
      )}
    </>
  );
}

/** "26 Nov", with the year when it isn't this year's. */
function recordedDate(recordedAt: string): string {
  const date = new Date(recordedAt);
  return date.getFullYear() === new Date().getFullYear()
    ? recordedDay.format(date)
    : recordedDayWithYear.format(date);
}
