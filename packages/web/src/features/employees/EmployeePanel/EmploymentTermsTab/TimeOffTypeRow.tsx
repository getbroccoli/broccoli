import { useState } from "react";
import { toast } from "sonner";

import {
  CancelOwnRulesChangeDocument,
  type EmploymentTermsTab_TermsFragment,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import {
  CancelChangeDialog,
  companyToday,
  splitVersions,
  TimeOffTypeIcon,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import { describeRules, rowOf } from "./employmentTermsView";
import { cancellableStarts, versionToEditFrom } from "./ownWeekText";
import { RulesRowEditor } from "./RulesRowEditor";
import { TermsRuleRow } from "./TermsRuleRow";
import type { OwnRulesEdit, OwnRulesFailure, OwnRulesMode, TermsOn } from "./useOwnRulesEdit";

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
    (version) => describeRules(version, t("ownRules.notOfferedTo", { name: firstName })),
    sourceOf,
    t("people.panel.terms.notOfferedLower"),
  );
  const editing = edit?.timeOffTypeId === timeOffType.id ? edit.mode : null;
  const base = versionToEditFrom(versions, today);
  const offered = Boolean(base?.rules);
  const { planned } = splitVersions(versions, today);
  const hasOwn = [base, ...planned].some((version) => version?.source === "THEIR_OWN");
  const canAct = edit !== null && edit.mode === null && !locked;
  const returnTerms = termsOn(base && base.startDate > today ? base.startDate : today);
  const open = (mode: OwnRulesMode) =>
    edit?.open({
      mode,
      timeOffType,
      current: base?.rules ? rulesInputOf(base.rules) : null,
      earliest,
      termsOn,
    });
  const cancel = async (startDate: string) => {
    try {
      await cancelChange({
        variables: { input: { employeeId, timeOffTypeId: timeOffType.id, startDate } },
      });
      toast(t("people.panel.terms.cancelled"));
    } catch (error) {
      const refused =
        error instanceof PayloadFailure ? (error.payloadError as OwnRulesFailure) : null;
      toast.error(
        refused?.__typename === "ConflictError"
          ? refused.message
          : t("people.panel.terms.cancelFailed"),
      );
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
          editing === "own"
            ? ""
            : currentTermsName
              ? t("people.panel.terms.notOffered", { terms: currentTermsName })
              : t("people.panel.terms.notOfferedWithoutTerms")
        }
        planned={row.planned}
        change={change}
        onCancel={
          canAct
            ? { startDates: cancellableStarts(versions, today), cancel: setCancelling }
            : undefined
        }
        name={timeOffType.name}
        actions={
          canAct
            ? [
                {
                  label: offered ? t("ownWeek.edit") : t("ownRules.offer", { name: firstName }),
                  onSelect: () => open("own"),
                },
                hasOwn &&
                  returnTerms !== null && {
                    label: t("ownRules.useTerms", { terms: returnTerms.termsName }),
                    onSelect: () => open("terms"),
                  },
                offered && {
                  label: t("ownRules.stop", { name: firstName }),
                  onSelect: () => open("stop"),
                  destructive: true,
                },
              ]
            : []
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

/** A version's rules as the form and the API take them. */
function rulesInputOf(rules: NonNullable<Version["rules"]>) {
  return {
    balance: rules.balance,
    entitlementDays: rules.yearlyEntitlement?.days ?? null,
    bankHolidays: rules.bankHolidays ?? null,
  };
}
