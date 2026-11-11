import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { weekdayDay } from "../timeOffText";
import { isWeekend } from "./calendarDates";
import type { BookingDraft } from "./useBookingDraft";

const PARTS = [
  { value: "FULL_DAY", label: "timeOff.dialog.fullDay" },
  { value: "MORNING", label: "timeOff.dialog.morning" },
  { value: "AFTERNOON", label: "timeOff.dialog.afternoon" },
] as const;

const WEEKDAY_NAME = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });

type Props = { draft: BookingDraft; firstName: string };

/** Every date of the booking with its cost; working days take a full day, a morning or an afternoon. */
export function DayByDayPane({ draft, firstName }: Props) {
  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-background">
      {(draft.preview?.days ?? []).map((day) => (
        <li
          key={day.date}
          className={cn(
            "flex flex-col gap-1.5 border-b border-border/60 px-3 py-2 last:border-b-0",
            day.reason !== "WORKING_DAY" && "bg-muted/60 text-muted-foreground",
          )}
        >
          <div className="flex justify-between text-[13px] font-medium">
            {weekdayDay(day.date)}
            <span className="tabular-nums">{day.cost}</span>
          </div>
          {day.reason === "WORKING_DAY" ? (
            <div role="radiogroup" aria-label={weekdayDay(day.date)} className="flex w-fit text-xs">
              {PARTS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={day.dayPart === value}
                  onClick={() => draft.setHalfDay(day.date, value)}
                  className={cn(
                    "border border-border px-2 py-0.5 first:rounded-l-md last:rounded-r-md",
                    day.dayPart === value
                      ? "bg-foreground font-medium text-background"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs">
              {day.reason === "BANK_HOLIDAY"
                ? day.bankHolidayName
                : isWeekend(day.date)
                  ? t("timeOff.dialog.weekend")
                  : t("timeOff.dialog.doesntWork", {
                      name: firstName,
                      weekday: WEEKDAY_NAME.format(Date.parse(day.date)),
                    })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
