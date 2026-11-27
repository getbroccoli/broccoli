import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { useRouteContext } from "@tanstack/react-router";

import { AllowanceHistoryDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { companyToday } from "@/features/termsDisplay";

import { AllowanceChangeRow } from "./AllowanceChangeRow";
import type { AllowanceChange } from "./allowanceHistoryText";
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
          <AllowanceChangeRow
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

/** The newest changes shown before Show all. */
const FIRST_SHOWN = 5;

/** An adjustment nobody has reversed yet; a reversal itself can't be reversed. */
function isReversible(change: AllowanceChange): boolean {
  return change.cause === "ALLOWANCE_ADJUSTED" && change.adjustmentId !== null && !change.reversed;
}
