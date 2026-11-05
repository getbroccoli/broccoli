import type { TimeOffBalanceKind, TimeOffPolicySummaryFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { countsText, reachText } from "../TimeOffSettings/policyText";
import { FieldHint } from "./FieldHint";
import { FieldRow } from "./FieldRow";
import { PolicyTag } from "./PolicyTag";
import { grantChanged, type PolicyDraft } from "./timeOffTypeDraft";
import type { FieldErrors } from "./useTimeOffTypeDraft";

type Props = {
  policy: PolicyDraft;
  /** As saved; null for a policy added in this panel. */
  saved: PolicyDraft | null;
  /** Who it applies to today and its leave year; null for a new policy. */
  summary: TimeOffPolicySummaryFragment | null;
  /** The type's only policy, shown as its Rules without a header of its own. */
  only: boolean;
  errors: FieldErrors;
  disabled: boolean;
  onEdit: (fields: Partial<PolicyDraft>) => void;
  onRemove: () => void;
};

/** One policy's rules, always open: how it counts, its allowance, bank holidays and who it reaches. */
export function PolicyFields({
  policy,
  saved,
  summary,
  only,
  errors,
  disabled,
  onEdit,
  onRemove,
}: Props) {
  const id = `policy-${policy.key}`;
  const error = (field: string) => errors[`${policy.key}.${field}`];
  const changed = saved !== null && (saved.name !== policy.name || grantChanged(saved, policy));
  const becomesOwn = policy.standard && saved !== null && grantChanged(saved, policy);
  const showName = !policy.standard || becomesOwn;
  // A standard policy that becomes the company's own drops the statutory cap.
  const dropsCap = becomesOwn;
  return (
    <article
      id={id}
      aria-labelledby={`${id}-name`}
      className={cn(
        !only && "overflow-hidden rounded-xl border border-border",
        !only && summary?.peopleCount === 0 && "border-dashed",
        changed && "border-brand/60",
      )}
    >
      {!only && (
        <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border bg-muted/40 px-4 py-3">
          <h3 id={`${id}-name`} className="text-sm font-semibold [overflow-wrap:anywhere]">
            {policy.name || t("settings.timeOffType.newPolicy")}
          </h3>
          {policy.standard && <PolicyTag>{t("settings.timeOffType.standard")}</PolicyTag>}
          {saved === null && <PolicyTag tone="brand">{t("settings.timeOffType.new")}</PolicyTag>}
          {changed && <PolicyTag tone="brand">{t("settings.timeOffType.changed")}</PolicyTag>}
          <span className="ml-auto text-xs text-muted-foreground">
            {summary ? reachText(summary) : t("settings.timeOffType.nobodyYet")}
          </span>
        </header>
      )}
      <div
        className={cn("grid gap-x-8 gap-y-4 sm:grid-cols-[13rem_minmax(0,1fr)]", !only && "p-4")}
      >
        {showName && (
          <FieldRow
            label={t("settings.timeOffType.policyName")}
            htmlFor={`${id}-name-input`}
            error={error("name")}
          >
            <Input
              id={`${id}-name-input`}
              value={policy.name}
              disabled={disabled}
              aria-invalid={Boolean(error("name"))}
              placeholder={t("settings.timeOffType.policyNamePlaceholder")}
              className="max-w-80"
              onChange={(event) => onEdit({ name: event.target.value })}
            />
            {policy.standard && <FieldHint>{t("settings.timeOffType.becomesOwn")}</FieldHint>}
          </FieldRow>
        )}
        <FieldRow label={t("settings.timeOffType.counts")}>
          {policy.everUsed ? (
            <span className="pt-1.5 text-sm">{countsText(toSummary(policy))}</span>
          ) : (
            <span
              role="radiogroup"
              aria-label={t("settings.timeOffType.counts")}
              className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
            >
              {BALANCES.map((balance) => (
                <button
                  key={balance}
                  type="button"
                  role="radio"
                  aria-checked={policy.balance === balance}
                  disabled={disabled}
                  onClick={() => onEdit({ balance, days: policy.days || "20" })}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    policy.balance === balance
                      ? "bg-card font-semibold shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {t(BALANCE_LABELS[balance])}
                </button>
              ))}
            </span>
          )}
        </FieldRow>
        {policy.balance === "BALANCE_FROM_ALLOWANCE" && (
          <>
            <FieldRow
              label={t("settings.timeOffType.allowance")}
              htmlFor={`${id}-days`}
              error={error("allowanceDays")}
            >
              <span className="flex flex-wrap items-center gap-2.5">
                <Input
                  id={`${id}-days`}
                  inputMode="decimal"
                  value={policy.days}
                  disabled={disabled}
                  aria-invalid={Boolean(error("allowanceDays"))}
                  className="w-20 tabular-nums"
                  onChange={(event) => onEdit({ days: event.target.value })}
                />
                <span className="text-sm">{allowanceUnit(summary, dropsCap)}</span>
              </span>
              <FieldHint>{t("settings.timeOffType.allowanceHint")}</FieldHint>
            </FieldRow>
            <FieldRow
              label={t("settings.timeOffType.bankHolidaysOnTop")}
              htmlFor={`${id}-bank-holidays`}
            >
              <span className="flex flex-col gap-1">
                <Switch
                  id={`${id}-bank-holidays`}
                  checked={policy.bankHolidaysOnTop}
                  disabled={disabled}
                  onCheckedChange={(checked) => onEdit({ bankHolidaysOnTop: checked })}
                />
                <FieldHint>
                  {t(
                    policy.bankHolidaysOnTop
                      ? "settings.timeOffType.onTopHint"
                      : "settings.timeOffType.includedHint",
                  )}
                </FieldHint>
              </span>
            </FieldRow>
          </>
        )}
        {policy.balance !== "NO_BALANCE" && (
          <FieldRow label={t("settings.timeOffType.leaveYear")}>
            <span className="text-sm">{leaveYearText(summary)}</span>
          </FieldRow>
        )}
        {only && summary && (
          <FieldRow label={t("settings.timeOffType.appliesTo")}>
            <span className="text-sm">{reachText(summary)}</span>
          </FieldRow>
        )}
      </div>
      {!policy.everUsed && !only && (
        <div className="flex justify-end px-4 pb-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={disabled}
            onClick={onRemove}
          >
            {t(
              saved ? "settings.timeOffType.deletePolicy" : "settings.timeOffType.removeNewPolicy",
            )}
          </Button>
        </div>
      )}
    </article>
  );
}

function toSummary({ balance, days, bankHolidaysOnTop }: PolicyDraft) {
  return {
    balance,
    allowance: {
      days: Number(days),
      daysPerWeek: 5,
      maxDays: null,
      bankHolidays: bankHolidaysOnTop
        ? ("BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE" as const)
        : ("BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE" as const),
    },
  };
}

function allowanceUnit(summary: TimeOffPolicySummaryFragment | null, dropsCap: boolean): string {
  const daysPerWeek = String(summary?.allowance?.daysPerWeek ?? 5);
  const maxDays = dropsCap ? null : summary?.allowance?.maxDays;
  return maxDays === null || maxDays === undefined
    ? t("settings.timeOffType.allowanceUnit", { daysPerWeek })
    : t("settings.timeOffType.allowanceUnitCapped", { daysPerWeek, maxDays: String(maxDays) });
}

function leaveYearText(summary: TimeOffPolicySummaryFragment | null): string {
  const leaveYear = summary?.leaveYear;
  if (leaveYear?.kind === "LEAVE_YEAR_FROM_EMPLOYEE_START_DATE") {
    return t("settings.timeOffType.leaveYearFromStart");
  }
  const date = new Date(Date.UTC(2000, (leaveYear?.month ?? 1) - 1, leaveYear?.day ?? 1));
  return t("settings.timeOffType.leaveYearFrom", {
    date: date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }),
  });
}

const BALANCE_LABELS = {
  BALANCE_FROM_ALLOWANCE: "settings.timeOff.fromBalance",
  UNLIMITED_BALANCE: "settings.timeOff.unlimited",
  NO_BALANCE: "settings.timeOff.doesNotCount",
} as const satisfies Record<TimeOffBalanceKind, string>;

const BALANCES: TimeOffBalanceKind[] = [
  "BALANCE_FROM_ALLOWANCE",
  "UNLIMITED_BALANCE",
  "NO_BALANCE",
];
