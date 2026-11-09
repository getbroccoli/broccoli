import { DatePicker } from "@/components/ui/date-picker";
import { t } from "@/i18n";

import { TimeOffRulesFields } from "../TimeOffSettings";
import {
  appliesFromHint,
  canChangeCounts,
  type RulesDraft,
  rulesErrors,
  rulesStartDate,
} from "./termsDraft";
import {
  companyToday,
  type PolicyVersionText,
  shortDate,
  splitVersions,
  versionOn,
  nextLeaveYear,
  DateChoice,
} from "@/features/termsDisplay";

type Props = {
  draft: RulesDraft;
  /** The type's versions from today on: today's first, then planned ones. */
  versions: PolicyVersionText[];
  earliest: string;
  /** Whether "Applies from" shows; not while nobody was ever on the terms. */
  dated: boolean;
  onChange: (draft: RulesDraft) => void;
};

/** A time off type's rules opened in place: how it counts, the allowance, and from when. */
export function RulesEditor({ draft, versions, earliest, dated, onChange }: Props) {
  const today = splitVersions(versions, companyToday()).current;
  const errors = rulesErrors(draft, earliest);
  // "Other date…" before a date is picked is no mistake yet; Save stays off until one is.
  const pickingDate = draft.appliesFrom === "ANOTHER_DATE" && !draft.otherDate;
  // A date off a leave year's start keeps how the type counts on that date.
  const changeDate = (next: RulesDraft) => {
    const base = versionOn(versions, rulesStartDate(next, earliest)) ?? today;
    onChange(base && !canChangeCounts(next, earliest) ? { ...next, balance: base.balance } : next);
  };
  return (
    <div className="flex flex-col gap-5">
      <TimeOffRulesFields
        values={draft}
        onChange={onChange}
        countsLocked={!canChangeCounts(draft, earliest)}
        countsHint={
          dated &&
          !draft.offer && (
            <p className="text-[13px] text-muted-foreground">{t("terms.edit.rules.countsHint")}</p>
          )
        }
      />

      {draft.balance !== "NO_BALANCE" && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t("terms.edit.rules.leaveYear")}</span>
          <span className="text-sm">{t("terms.edit.rules.leaveYearValue")}</span>
        </div>
      )}

      {dated && (
        <DateChoice
          name="rules-start"
          options={[
            { value: "THIS_LEAVE_YEAR", label: shortDate(earliest) },
            { value: "NEXT_LEAVE_YEAR", label: shortDate(nextLeaveYear(earliest)) },
            { value: "ANOTHER_DATE", label: t("terms.edit.otherDate") },
          ]}
          selected={draft.appliesFrom}
          onSelect={(appliesFrom) => changeDate({ ...draft, appliesFrom })}
          hint={appliesFromHint(draft, earliest)}
          error={pickingDate ? undefined : errors.startDate}
          picker={
            <DatePicker
              value={draft.otherDate}
              fromDate={earliest}
              placeholder={t("terms.edit.pickDate")}
              aria-label={t("terms.edit.pickDate")}
              aria-invalid={!pickingDate && Boolean(errors.startDate)}
              onChange={(otherDate) => changeDate({ ...draft, otherDate })}
            />
          }
        />
      )}
    </div>
  );
}
