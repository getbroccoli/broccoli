import { useState } from "react";

import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { FieldError } from "@/components/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { calendarName } from "./calendarName";
import { DateChoice } from "./DateChoice";
import {
  nextLeaveYear,
  type WeekDraft,
  weekErrors,
  weekHint,
  type WeekVersion,
} from "./termsDraft";
import { companyToday, DAY_NAMES, shortDate } from "./termsText";

type Props = {
  draft: WeekDraft;
  current: WeekVersion;
  earliest: string;
  onChange: (draft: WeekDraft) => void;
};

/** The working week section opened in place: hours each day, bank holidays, from when. */
export function WeekEditor({ draft, current, earliest, onChange }: Props) {
  const today = companyToday();
  const nextYear = nextLeaveYear(earliest);
  const [other, setOther] = useState(false);
  const choice =
    other || (draft.startDate !== today && draft.startDate !== nextYear)
      ? "ANOTHER_DATE"
      : draft.startDate === today
        ? "TODAY"
        : "NEXT_LEAVE_YEAR";
  const errors = weekErrors(draft, earliest);
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-foreground p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t("terms.edit.week.hoursEachDay")}</legend>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {draft.hours.map((hours, index) => (
            <label key={index} className="flex flex-col gap-1 text-center">
              <span className="text-xs text-muted-foreground">{t(DAY_NAMES[index]!)}</span>
              <Input
                value={hours}
                inputMode="decimal"
                aria-invalid={Boolean(errors.hours)}
                aria-describedby="week-hours-hint"
                className={cn("px-1 text-center", Number(hours) === 0 && "text-muted-foreground")}
                onChange={(event) =>
                  onChange({ ...draft, hours: draft.hours.with(index, event.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <p id="week-hours-hint" className="text-[13px] text-muted-foreground">
          {errors.hours ? null : weekHint(draft, current)}
        </p>
        <FieldError id="week-hours-error" message={errors.hours} />
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t("terms.week.bankHolidays")}</span>
        <select
          value={draft.calendar}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          onChange={(event) =>
            onChange({ ...draft, calendar: event.target.value as BankHolidayCalendar })
          }
        >
          {CALENDARS.map((calendar) => (
            <option key={calendar} value={calendar}>
              {calendarName(calendar)}
            </option>
          ))}
        </select>
      </label>

      <DateChoice
        name="week-start"
        options={[
          { value: "TODAY", label: t("terms.edit.today") },
          { value: "NEXT_LEAVE_YEAR", label: shortDate(nextYear) },
          { value: "ANOTHER_DATE", label: t("terms.edit.otherDate") },
        ]}
        selected={choice}
        onSelect={(value) => {
          setOther(value === "ANOTHER_DATE");
          if (value !== "ANOTHER_DATE") {
            onChange({ ...draft, startDate: value === "TODAY" ? today : nextYear });
          }
        }}
        hint={t("terms.edit.week.startHint")}
        error={errors.startDate}
        picker={
          <DatePicker
            value={draft.startDate}
            fromDate={earliest}
            placeholder={t("terms.edit.pickDate")}
            aria-label={t("terms.edit.pickDate")}
            aria-invalid={Boolean(errors.startDate)}
            onChange={(startDate) => onChange({ ...draft, startDate })}
          />
        }
      />
    </div>
  );
}

const CALENDARS: BankHolidayCalendar[] = ["ENGLAND_AND_WALES", "SCOTLAND", "NORTHERN_IRELAND"];
