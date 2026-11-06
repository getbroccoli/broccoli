import type { TimeOffBalanceKind } from "@/__generated__/graphql";
import { FieldError, OptionCard } from "@/components/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { type MessageKey, t } from "@/i18n";
import { cn } from "@/lib/class-names";

import {
  appliesFromHints,
  canChangeCounts,
  nextLeaveYear,
  type RulesDraft,
  rulesErrors,
} from "./termsDraft";
import { type PolicyVersionText, shortDate } from "./termsText";

type Props = {
  draft: RulesDraft;
  current: PolicyVersionText | null;
  earliest: string;
  onChange: (draft: RulesDraft) => void;
};

/** A time off type's rules opened in place: how it counts, the allowance, and from when. */
export function RulesEditor({ draft, current, earliest, onChange }: Props) {
  const errors = rulesErrors(draft, earliest);
  const countsOpen = canChangeCounts(draft, earliest);
  const hints = appliesFromHints(draft, current);
  // A date off a leave year's start keeps how the type counts now.
  const changeDate = (next: RulesDraft) =>
    onChange(
      current && !canChangeCounts(next, earliest) ? { ...next, balance: current.balance } : next,
    );
  const appliesFromTitles: Record<RulesDraft["appliesFrom"], string> = {
    THIS_LEAVE_YEAR: t("terms.edit.rules.thisYear", { date: shortDate(earliest) }),
    NEXT_LEAVE_YEAR: t("terms.edit.rules.nextYear", { date: shortDate(nextLeaveYear(earliest)) }),
    ANOTHER_DATE: t("terms.edit.rules.anotherDate"),
  };
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t("terms.edit.rules.counts")}</legend>
        {COUNTS.map(({ balance, title, hint }) => (
          <OptionCard
            key={balance}
            name="counts"
            value={balance}
            selected={draft.balance}
            disabled={!countsOpen && balance !== draft.balance}
            onSelect={(value) => onChange({ ...draft, balance: value })}
            title={t(title)}
            hint={t(hint)}
          />
        ))}
        {!draft.offer && (
          <p className="text-[13px] text-muted-foreground">{t("terms.edit.rules.countsHint")}</p>
        )}
      </fieldset>

      {draft.balance === "BALANCE_FROM_ALLOWANCE" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t("terms.edit.rules.allowance")}</span>
            <span className="flex flex-wrap items-center gap-2.5">
              <Input
                value={draft.days}
                inputMode="decimal"
                className="w-24 font-semibold"
                aria-invalid={Boolean(errors.days)}
                aria-describedby="rules-days-error"
                onChange={(event) => onChange({ ...draft, days: event.target.value })}
              />
              <span className="text-sm">{t("terms.edit.rules.allowanceUnit")}</span>
            </span>
            <span className="text-[13px] text-muted-foreground">
              {t("terms.edit.rules.allowanceHint")}
            </span>
            <FieldError id="rules-days-error" message={errors.days} />
          </label>
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={draft.onTop}
              aria-labelledby="rules-on-top"
              onClick={() => onChange({ ...draft, onTop: !draft.onTop })}
              className={cn(
                "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
                draft.onTop ? "bg-foreground" : "bg-muted-foreground/40",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-background transition-all",
                  draft.onTop ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
            <div>
              <p id="rules-on-top" className="text-sm font-semibold">
                {t("terms.edit.rules.onTop")}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {t(draft.onTop ? "terms.edit.rules.onTopHint" : "terms.edit.rules.includedHint", {
                  days: draft.days,
                })}
              </p>
            </div>
          </div>
        </>
      )}

      {draft.balance !== "NO_BALANCE" && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t("terms.edit.rules.leaveYear")}</span>
          <span className="text-sm">{t("terms.edit.rules.leaveYearValue")}</span>
        </div>
      )}

      <fieldset className="flex flex-col gap-2 border-t border-border pt-5">
        <legend className="mb-2 float-left w-full text-sm font-semibold">
          {t("terms.edit.appliesFrom")}
        </legend>
        {APPLIES_FROM.map((appliesFrom) => (
          <OptionCard
            key={appliesFrom}
            name="applies-from"
            value={appliesFrom}
            selected={draft.appliesFrom}
            onSelect={(value) => changeDate({ ...draft, appliesFrom: value })}
            title={appliesFromTitles[appliesFrom]}
            hint={hints[appliesFrom]}
          >
            {appliesFrom === "ANOTHER_DATE" && (
              <div className="flex max-w-64">
                <DatePicker
                  value={draft.otherDate}
                  fromDate={earliest}
                  placeholder={t("terms.edit.rules.anotherDate")}
                  aria-label={t("terms.edit.rules.anotherDate")}
                  aria-invalid={Boolean(errors.startDate)}
                  onChange={(otherDate) => changeDate({ ...draft, otherDate })}
                />
              </div>
            )}
          </OptionCard>
        ))}
        <FieldError id="rules-start-error" message={errors.startDate} />
      </fieldset>
    </div>
  );
}

const COUNTS: { balance: TimeOffBalanceKind; title: MessageKey; hint: MessageKey }[] = [
  {
    balance: "BALANCE_FROM_ALLOWANCE",
    title: "terms.rule.fromBalance",
    hint: "terms.edit.rules.fromBalanceHint",
  },
  {
    balance: "UNLIMITED_BALANCE",
    title: "terms.rule.unlimited",
    hint: "terms.edit.rules.unlimitedHint",
  },
  {
    balance: "NO_BALANCE",
    title: "terms.edit.rules.doesNotCount",
    hint: "terms.edit.rules.recordedHint",
  },
];

const APPLIES_FROM: RulesDraft["appliesFrom"][] = [
  "THIS_LEAVE_YEAR",
  "NEXT_LEAVE_YEAR",
  "ANOTHER_DATE",
];
