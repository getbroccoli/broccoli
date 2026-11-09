import { useState } from "react";
import { toast } from "sonner";

import {
  CancelOwnWorkingWeekChangeDocument,
  type EmploymentTermsTab_TermsFragment,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { CancelChangeDialog, companyToday, splitVersions } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import { describeWeek, rowOf } from "./employmentTermsView";
import { WeekRowEditor } from "./WeekRowEditor";
import { cancellableStarts } from "./ownWeekText";
import { TermsRuleRow } from "./TermsRuleRow";
import type { OwnWeekEdit } from "./useOwnWeekEdit";

type Week = EmploymentTermsTab_TermsFragment["workingWeek"][number];

type Props = {
  employeeId: string;
  firstName: string;
  workingWeek: readonly Week[];
  sourceOf: (version: Week) => string;
  /** What a move being edited changes here. */
  change: string | null;
  /** Admins edit the person's own week here; null for everyone else. */
  edit: OwnWeekEdit | null;
  /** Another edit is open on the tab, so this row's actions wait. */
  locked: boolean;
  earliest: string;
  /** The terms the person is on on a date, whose week a return gives back. */
  termsNameOn: (date: string) => string;
};

/** The working week row: today's week and planned ones, and for admins the person's own week. */
export function WeekRow({
  employeeId,
  firstName,
  workingWeek,
  sourceOf,
  change,
  edit,
  locked,
  earliest,
  termsNameOn,
}: Props) {
  const today = companyToday();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelChange, { loading }] = usePayloadMutation(CancelOwnWorkingWeekChangeDocument, {
    update: forgetHistory,
  });
  const row = rowOf(
    workingWeek,
    today,
    describeWeek,
    sourceOf,
    t("people.panel.terms.noWeekLower"),
  );
  const { current, planned } = splitVersions(workingWeek, today);
  const hasOwn = [current, ...planned].some((version) => version?.source === "THEIR_OWN");
  const canAct = edit !== null && edit.mode === null && !locked && current !== null;
  const open = (mode: "own" | "terms") =>
    current &&
    edit?.open({
      mode,
      current: current.week,
      earliest,
      alreadyOwn: current.source === "THEIR_OWN",
      termsNameOn,
    });
  const cancel = async (startDate: string) => {
    try {
      await cancelChange({ variables: { input: { employeeId, startDate } } });
      toast(t("people.panel.terms.cancelled"));
    } catch {
      toast.error(t("people.panel.terms.cancelFailed"));
    }
    setCancelling(null);
  };

  return (
    <>
      <TermsRuleRow
        label={t("people.panel.terms.workingWeek")}
        value={edit?.mode === "own" ? null : row.value}
        missing={edit?.mode === "own" ? "" : t("people.panel.terms.noWeek")}
        planned={row.planned}
        change={change}
        onCancel={
          canAct
            ? { startDates: cancellableStarts(workingWeek, today), cancel: setCancelling }
            : undefined
        }
        actions={
          canAct && (
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => open("own")}>
                {t("ownWeek.edit")}
              </Button>
              {hasOwn && (
                <Button variant="ghost" size="sm" onClick={() => open("terms")}>
                  {t("ownWeek.useTerms", { terms: termsNameOn(today) })}
                </Button>
              )}
            </span>
          )
        }
        editor={edit?.mode && <WeekRowEditor edit={edit} firstName={firstName} />}
      />
      <CancelChangeDialog
        body={cancelling ? t("ownWeek.cancelBody", { name: firstName }) : null}
        pending={loading}
        onConfirm={() => void cancel(cancelling!)}
        onClose={() => setCancelling(null)}
      />
    </>
  );
}
