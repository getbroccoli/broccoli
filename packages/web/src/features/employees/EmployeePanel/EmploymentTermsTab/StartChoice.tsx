import { useState } from "react";

import { DatePicker } from "@/components/ui/date-picker";
import { DateChoice, nextLeaveYear, shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

type Props = {
  value: string;
  earliest: string;
  /** The first choice: today for a week, the start of this leave year for rules. */
  first: { label: string; date: string };
  hint: string;
  error: string | null;
  onChange: (startDate: string) => void;
};

/** From when an own week or own rules apply: the first choice, the next leave year, or another date. */
export function StartChoice({ value, earliest, first, hint, error, onChange }: Props) {
  // From the leave year's start: a person who started this year may not change before their start.
  const nextYear = nextLeaveYear(`${earliest.slice(0, 4)}-01-01`);
  const [other, setOther] = useState(false);
  const choice =
    other || (value !== first.date && value !== nextYear)
      ? "ANOTHER_DATE"
      : value === first.date
        ? "FIRST"
        : "NEXT_LEAVE_YEAR";
  return (
    <DateChoice
      name="own-start"
      options={[
        { value: "FIRST", label: first.label },
        { value: "NEXT_LEAVE_YEAR", label: shortDate(nextYear) },
        { value: "ANOTHER_DATE", label: t("terms.edit.otherDate") },
      ]}
      selected={choice}
      onSelect={(selected) => {
        setOther(selected === "ANOTHER_DATE");
        if (selected !== "ANOTHER_DATE") {
          onChange(selected === "FIRST" ? first.date : nextYear);
        }
      }}
      hint={hint}
      error={error ?? undefined}
      picker={
        <DatePicker
          value={value}
          fromDate={earliest}
          placeholder={t("terms.edit.pickDate")}
          aria-label={t("terms.edit.pickDate")}
          aria-invalid={Boolean(error)}
          onChange={onChange}
        />
      }
    />
  );
}
