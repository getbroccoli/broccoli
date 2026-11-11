import { useState } from "react";
import { toast } from "sonner";

import {
  CancelTermsTimeOffChangeDocument,
  CancelTermsWorkingWeekChangeDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { peopleText } from "./termsDraft";
import { TERMS_REFETCH, type Terms, type TimeOffRow } from "./termsQueries";
import { ruleSummary, versionBefore, weekSummary } from "@/features/termsDisplay";
import { addDays } from "@/lib/calendarDay";

/** A planned change waiting for "Cancel change" to be confirmed, with what stays once it goes. */
type PlannedChange = { kind: "week" | "rules"; assignmentId: string; body: string };

/** Cancelling the terms' planned changes, each after a confirmation saying what stays. */
export function usePlannedChanges(terms: Terms) {
  const [planned, setPlanned] = useState<PlannedChange | null>(null);
  const options = { refetch: TERMS_REFETCH };
  const [cancelWeek, weekState] = usePayloadMutation(CancelTermsWorkingWeekChangeDocument, options);
  const [cancelRules, rulesState] = usePayloadMutation(CancelTermsTimeOffChangeDocument, options);

  const confirm = async ({ kind, assignmentId }: PlannedChange) => {
    try {
      const cancel = kind === "week" ? cancelWeek : cancelRules;
      await cancel({ variables: { input: { assignmentId } } });
      toast(t("terms.edit.cancelled"));
    } catch (error) {
      // A conflict says why the change stays, such as having started meanwhile.
      const failure =
        error instanceof PayloadFailure
          ? (error.payloadError as { __typename: string; message: string })
          : null;
      toast.error(
        failure?.__typename === "ConflictError" ? failure.message : t("terms.edit.cancelFailed"),
      );
    }
    setPlanned(null);
  };

  return {
    /** What stays once the asked change goes; null while none is asked. */
    body: planned?.body ?? null,
    pending: weekState.loading || rulesState.loading,
    askWeek: (version: Terms["workingWeek"][number]) => setPlanned(weekChange(terms, version)),
    askRules: (timeOffTypeId: string, version: TimeOffRow["versions"][number]) =>
      setPlanned(rulesChange(terms, timeOffTypeId, version)),
    close: () => setPlanned(null),
    confirm: () => planned && void confirm(planned),
  };
}

function weekChange(terms: Terms, version: Terms["workingWeek"][number]): PlannedChange {
  const before = rowBefore(terms.workingWeek, version.startDate);
  return {
    kind: "week",
    assignmentId: version.id,
    body: before
      ? t("terms.edit.weekStays", {
          week: weekSummary(before),
          people: peopleText(terms.peopleCount),
          terms: terms.name,
        })
      : t("terms.edit.weekStaysNone", { terms: terms.name }),
  };
}

function rulesChange(
  terms: Terms,
  timeOffTypeId: string,
  version: TimeOffRow["versions"][number],
): PlannedChange {
  const row = terms.timeOff.find(({ timeOffType }) => timeOffType.id === timeOffTypeId)!;
  const before = rowBefore(row.versions, version.startDate);
  const values = {
    type: row.timeOffType.name,
    people: peopleText(terms.peopleCount),
    terms: terms.name,
  };
  const fromAllowance = before?.balance === "BALANCE_FROM_ALLOWANCE";
  return {
    kind: "rules",
    assignmentId: version.id,
    body: before
      ? t(fromAllowance ? "terms.edit.rulesStaysAt" : "terms.edit.rulesStays", {
          ...values,
          rule: ruleSummary(before),
        })
      : t("terms.edit.offerStays", values),
  };
}

/**
 * The row a cancelled one's days go back to: the one before it, when it ends the day before; null
 * across a gap, which stays empty.
 */
function rowBefore<V extends { startDate: string; endDate?: string | null }>(
  rows: readonly V[],
  startDate: string,
): V | null {
  const before = versionBefore(rows, startDate);
  return before?.endDate === addDays(startDate, -1) ? before : null;
}
