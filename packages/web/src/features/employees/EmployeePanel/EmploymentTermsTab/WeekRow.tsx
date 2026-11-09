import { useState } from "react";
import { toast } from "sonner";

import {
  CancelOwnWorkingWeekChangeDocument,
  type EmploymentTermsTab_TermsFragment,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  CancelChangeDialog,
  companyToday,
  splitVersions,
  WeekEditor,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import { describeWeek, rowOf } from "./employmentTermsView";
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
  /** The terms whose week a return gives back. */
  termsName: string;
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
  termsName,
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
      termsName,
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
                  {t("ownWeek.useTerms", { terms: termsName })}
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

/** The row's editor: the week and from when, or only from when for a return to the terms. */
function WeekRowEditor({ edit, firstName }: { edit: OwnWeekEdit; firstName: string }) {
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-foreground p-3">
      {edit.mode === "own" && edit.current ? (
        <WeekEditor
          draft={edit.draft}
          current={edit.current}
          earliest={edit.earliest}
          dated
          onChange={edit.edit}
        />
      ) : (
        <div className="flex max-w-64 flex-col gap-1.5">
          <Label>{t("changeTerms.appliesFrom")}</Label>
          <DatePicker
            value={edit.draft.startDate}
            fromDate={edit.earliest}
            placeholder={t("changeTerms.appliesFrom")}
            aria-label={t("changeTerms.appliesFrom")}
            // A return needs a date: picking the chosen day again keeps it.
            onChange={(startDate) => startDate && edit.edit({ ...edit.draft, startDate })}
          />
          <p className="text-[13px] text-muted-foreground">
            {t("ownWeek.backHint", { name: firstName })}
          </p>
        </div>
      )}
      <FieldError id="own-week-error" message={edit.error ?? undefined} />
    </div>
  );
}
