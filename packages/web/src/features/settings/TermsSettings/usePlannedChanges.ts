import { useState } from "react";
import { toast } from "sonner";

import {
  CancelTermsTimeOffChangeDocument,
  CancelTermsWorkingWeekChangeDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { TERMS_REFETCH, type Terms, type TimeOffRow } from "./termsQueries";
import { ruleSummary, versionBefore, weekSummary } from "@/features/termsDisplay";

/** A planned change waiting for "Cancel change" to be confirmed, with what stays once it goes. */
type PlannedChange =
  | { kind: "week"; startDate: string; body: string }
  | { kind: "rules"; timeOffPolicyId: string; startDate: string; body: string };

/** Cancelling the terms' planned changes, each after a confirmation saying what stays. */
export function usePlannedChanges(terms: Terms) {
  const [planned, setPlanned] = useState<PlannedChange | null>(null);
  const options = { refetch: TERMS_REFETCH };
  const [cancelWeek, weekState] = usePayloadMutation(CancelTermsWorkingWeekChangeDocument, options);
  const [cancelRules, rulesState] = usePayloadMutation(CancelTermsTimeOffChangeDocument, options);

  const confirm = async (change: PlannedChange) => {
    try {
      if (change.kind === "week") {
        const input = { workingPatternId: terms.workingPattern.id, startDate: change.startDate };
        await cancelWeek({ variables: { input } });
      } else {
        const { timeOffPolicyId, startDate } = change;
        await cancelRules({ variables: { input: { timeOffPolicyId, startDate } } });
      }
      toast(t("terms.edit.cancelled"));
    } catch {
      toast.error(t("terms.edit.cancelFailed"));
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

function weekChange(terms: Terms, version: Terms["workingWeek"][number]): PlannedChange | null {
  const before = versionBefore(terms.workingWeek, version.startDate!);
  return (
    before && {
      kind: "week",
      startDate: version.startDate!,
      body: t("terms.edit.weekStays", {
        week: weekSummary(before),
        people: peopleOf(terms.peopleCount),
        terms: terms.name,
      }),
    }
  );
}

function rulesChange(
  terms: Terms,
  timeOffTypeId: string,
  version: TimeOffRow["versions"][number],
): PlannedChange {
  const row = terms.timeOff.find(({ timeOffType }) => timeOffType.id === timeOffTypeId)!;
  const before = versionBefore(row.versions, version.startDate!);
  const values = {
    type: row.timeOffType.name,
    people: peopleOf(terms.peopleCount),
    terms: terms.name,
  };
  const fromAllowance = before?.balance === "BALANCE_FROM_ALLOWANCE";
  return {
    kind: "rules",
    timeOffPolicyId: row.policy!.id,
    startDate: version.startDate!,
    body: before
      ? t(fromAllowance ? "terms.edit.rulesStaysAt" : "terms.edit.rulesStays", {
          ...values,
          rule: ruleSummary(before),
        })
      : t("terms.edit.offerStays", values),
  };
}

function peopleOf(count: number): string {
  return count === 1 ? t("terms.edit.onePerson") : t("terms.edit.people", { count: String(count) });
}
