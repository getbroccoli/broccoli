import { useQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";

import { AllowanceHistoryDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { changeTitle, partsLine, signedDays } from "./allowanceHistoryText";

type Props = {
  employeeId: string;
  allowanceId: string;
};

const recordedDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const recordedDayWithYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A balance's changes, newest first, each with what it did and the days left after it. */
export function AllowanceHistory({ employeeId, allowanceId }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
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
    <ol className="flex flex-col border-t border-border/60">
      {changes.map((change, index) => {
        const parts = partsLine(change);
        return (
          <li
            key={`${change.recordedAt}:${change.cause}:${index}`}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0"
          >
            <span className="text-muted-foreground">{recordedDate(change.recordedAt)}</span>
            <span className="flex min-w-0 flex-col">
              <span>{changeTitle(change, me.id)}</span>
              {change.comment && (
                <span className="text-muted-foreground break-words">{change.comment}</span>
              )}
              {parts && <span className="text-xs text-muted-foreground">{parts}</span>}
            </span>
            <span className="flex flex-col items-end">
              <span className="font-medium tabular-nums">{signedDays(change.amount)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("people.panel.timeOff.history.left", { days: formatDays(change.balanceAfter) })}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "26 Nov", with the year when it isn't this year's. */
function recordedDate(recordedAt: string): string {
  const date = new Date(recordedAt);
  return date.getFullYear() === new Date().getFullYear()
    ? recordedDay.format(date)
    : recordedDayWithYear.format(date);
}
