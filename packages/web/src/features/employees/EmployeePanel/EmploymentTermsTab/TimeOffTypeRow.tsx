import { useState } from "react";
import { toast } from "sonner";

import {
  CancelOwnRulesChangeDocument,
  type EmploymentTermsTab_TermsFragment,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  CancelChangeDialog,
  companyToday,
  ruleSummary,
  splitVersions,
  TimeOffTypeIcon,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import { rowOf } from "./employmentTermsView";
import { cancellableStarts, weekToEditFrom } from "./ownWeekText";
import { RulesRowEditor } from "./RulesRowEditor";
import { TermsRuleRow } from "./TermsRuleRow";
import type { OwnRulesEdit, TermsOn } from "./useOwnRulesEdit";

type TimeOff = NonNullable<EmploymentTermsTab_TermsFragment["timeOff"]>[number];
type Version = TimeOff["versions"][number];

type Props = {
  employeeId: string;
  firstName: string;
  timeOff: TimeOff;
  sourceOf: (version: Version) => string;
  /** The terms the person is on today, for "Not offered on England and Wales". */
  currentTermsName: string;
  /** What a move being edited changes here. */
  change: string | null;
  /** Admins edit the person's own rules here; null for everyone else. */
  edit: OwnRulesEdit | null;
  /** Another edit is open on the tab, so this row's actions wait. */
  locked: boolean;
  earliest: string;
  termsOn: TermsOn;
};

/** A time off type's row: today's rules and planned ones, and for admins the person's own rules. */
export function TimeOffTypeRow({
  employeeId,
  firstName,
  timeOff: { timeOffType, versions },
  sourceOf,
  currentTermsName,
  change,
  edit,
  locked,
  earliest,
  termsOn,
}: Props) {
  const today = companyToday();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelChange, { loading }] = usePayloadMutation(CancelOwnRulesChangeDocument, {
    update: forgetHistory,
  });
  const row = rowOf(
    versions,
    today,
    describeRules,
    sourceOf,
    t("people.panel.terms.notOfferedLower"),
  );
  const editing = edit?.timeOffTypeId === timeOffType.id ? edit.mode : null;
  const base = weekToEditFrom(versions, today);
  const { planned } = splitVersions(versions, today);
  const hasOwn = [base, ...planned].some((version) => version?.source === "THEIR_OWN");
  const canAct = edit !== null && edit.mode === null && !locked;
  const returnDate = base && base.startDate > today ? base.startDate : today;
  const open = (mode: "own" | "terms") =>
    edit?.open({
      mode,
      timeOffType,
      current: base && rulesInputOf(base.rules),
      earliest,
      alreadyOwn: base?.source === "THEIR_OWN",
      termsOn,
    });
  const cancel = async (startDate: string) => {
    try {
      await cancelChange({
        variables: { input: { employeeId, timeOffTypeId: timeOffType.id, startDate } },
      });
      toast(t("people.panel.terms.cancelled"));
    } catch {
      toast.error(t("people.panel.terms.cancelFailed"));
    }
    setCancelling(null);
  };

  return (
    <>
      <TermsRuleRow
        label={
          <>
            <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
            <span className="[overflow-wrap:anywhere]">{timeOffType.name}</span>
          </>
        }
        value={editing === "own" ? null : row.value}
        missing={
          editing === "own" ? "" : t("people.panel.terms.notOffered", { terms: currentTermsName })
        }
        planned={row.planned}
        change={change}
        onCancel={
          canAct
            ? { startDates: cancellableStarts(versions, today), cancel: setCancelling }
            : undefined
        }
        actions={
          canAct && (
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => open("own")}>
                {base ? t("ownWeek.edit") : t("ownRules.offer", { name: firstName })}
              </Button>
              {hasOwn && (
                <Button variant="ghost" size="sm" onClick={() => open("terms")}>
                  {t("ownRules.useTerms", { terms: termsOn(returnDate)?.termsName ?? "" })}
                </Button>
              )}
            </span>
          )
        }
        editor={
          editing && (
            <RulesRowEditor
              edit={edit!}
              hint={t("ownRules.backHint", { name: firstName, type: timeOffType.name })}
            />
          )
        }
      />
      <CancelChangeDialog
        body={
          cancelling ? t("ownRules.cancelBody", { name: firstName, type: timeOffType.name }) : null
        }
        pending={loading}
        onConfirm={() => void cancel(cancelling!)}
        onClose={() => setCancelling(null)}
      />
    </>
  );
}

/** A type's rules as its row reads them: "20 days a year, bank holidays on top", or recorded only. */
export function describeRules({ rules }: Version) {
  return {
    text: rules.balance === "NO_BALANCE" ? t("terms.rule.recorded") : ruleSummary(rules),
  };
}

/** A version's rules as the form and the API take them. */
function rulesInputOf(rules: Version["rules"]) {
  return {
    balance: rules.balance,
    entitlementDays: rules.yearlyEntitlement?.days ?? null,
    bankHolidays: rules.bankHolidays ?? null,
  };
}
