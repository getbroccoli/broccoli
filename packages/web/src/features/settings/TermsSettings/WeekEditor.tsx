import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { FieldError } from "@/components/form";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { calendarName, DAY_NAMES } from "@/features/termsDisplay";

import { type WeekDraft, weekErrors, weekHint, type WeekVersion } from "./termsDraft";

type Props = {
  draft: WeekDraft;
  /** The week the terms work today, which the hint compares with; null while they work none. */
  current: WeekVersion | null;
  onChange: (draft: WeekDraft) => void;
};

/** The working week section opened in place: hours each day and bank holidays. */
export function WeekEditor({ draft, current, onChange }: Props) {
  const errors = weekErrors(draft);
  return (
    <div className="flex flex-col gap-5">
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
          {errors.hours || !current ? null : weekHint(draft, current)}
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
    </div>
  );
}

const CALENDARS: BankHolidayCalendar[] = ["ENGLAND_AND_WALES", "SCOTLAND", "NORTHERN_IRELAND"];
