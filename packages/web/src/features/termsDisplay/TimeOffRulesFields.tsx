import type { TimeOffBalanceKind } from "@/__generated__/graphql";
import { FieldError, OptionCard } from "@/components/form";
import { Input } from "@/components/ui/input";
import { type MessageKey, t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { daysError, type RulesValues } from "./rulesValues";

type Props<Values extends RulesValues> = {
  values: Values;
  onChange: (values: Values) => void;
};

/** How a type counts, with its allowance and bank holidays when it counts from a balance. */
export function TimeOffRulesFields<Values extends RulesValues>({
  values,
  onChange,
}: Props<Values>) {
  const error = daysError(values);
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t("terms.edit.rules.counts")}</legend>
        {COUNTS.map(({ balance, title, hint }) => (
          <OptionCard
            key={balance}
            name="counts"
            value={balance}
            selected={values.balance}
            onSelect={(value) => onChange({ ...values, balance: value })}
            title={t(title)}
            hint={t(hint)}
          />
        ))}
      </fieldset>

      {values.balance === "BALANCE_FROM_ALLOWANCE" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t("terms.edit.rules.allowance")}</span>
            <span className="flex flex-wrap items-center gap-2.5">
              <Input
                value={values.days}
                inputMode="decimal"
                className="w-24 font-semibold"
                aria-invalid={Boolean(error)}
                aria-describedby="rules-days-error"
                onChange={(event) => onChange({ ...values, days: event.target.value })}
              />
              <span className="text-sm">{t("terms.edit.rules.allowanceUnit")}</span>
            </span>
            <span className="text-[13px] text-muted-foreground">
              {t("terms.edit.rules.allowanceHint")}
            </span>
            <FieldError id="rules-days-error" message={error} />
          </label>
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={values.onTop}
              aria-labelledby="rules-on-top"
              onClick={() => onChange({ ...values, onTop: !values.onTop })}
              className={cn(
                "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
                values.onTop ? "bg-foreground" : "bg-muted-foreground/40",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-background transition-all",
                  values.onTop ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
            <div>
              <p id="rules-on-top" className="text-sm font-semibold">
                {t("terms.edit.rules.onTop")}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {t(values.onTop ? "terms.edit.rules.onTopHint" : "terms.edit.rules.includedHint", {
                  days: values.days,
                })}
              </p>
            </div>
          </div>
        </>
      )}
    </>
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
