import { CalendarBlank } from "@phosphor-icons/react";

import type { EmploymentTermsStackQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { calendarName } from "./calendarName";
import {
  companyToday,
  DAY_FIELDS,
  DAY_NAMES,
  hoursOf,
  plannedWeekLine,
  splitVersions,
} from "./termsText";

type Props = {
  versions: NonNullable<EmploymentTermsStackQuery["terms"]>["workingWeek"];
};

/** The terms' working week today, day by day, with any planned week under it. */
export function WorkingWeekSection({ versions }: Props) {
  const { current, planned } = splitVersions(versions, companyToday());
  return (
    <section aria-labelledby="terms-week" className="flex flex-col gap-3">
      <h3 id="terms-week" className="text-[17px] font-semibold">
        {t("terms.week.title")}
      </h3>
      {current ? (
        <>
          <ol className="grid grid-cols-7 gap-1 sm:gap-2">
            {DAY_FIELDS.map((field, index) => (
              <li
                key={field}
                className={cn(
                  "rounded-xl border border-border px-1 py-2 text-center",
                  current[field] === 0 && "bg-muted/50",
                )}
              >
                <span className="block text-xs text-muted-foreground">{t(DAY_NAMES[index]!)}</span>
                <span
                  className={cn(
                    "block font-semibold",
                    current[field] === 0 && "text-sm font-medium text-muted-foreground",
                  )}
                >
                  {current[field] === 0 ? t("terms.day.off") : hoursOf(current[field])}
                </span>
              </li>
            ))}
          </ol>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {weekFacts(current).map(({ label, value }) => (
              <div key={label} className="flex gap-1.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("terms.week.none")}</p>
      )}
      {planned.map((version) => (
        <p key={version.id} className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CalendarBlank aria-hidden />
          {`${plannedWeekLine(version)}, ${t("terms.bankHolidays", {
            calendar: calendarName(version.bankHolidayCalendar),
          })}`}
        </p>
      ))}
    </section>
  );
}

/** The facts under the day cells: weekly hours and whose bank holidays. */
function weekFacts(week: Props["versions"][number]): { label: string; value: string }[] {
  return [
    {
      label: t("terms.week.weeklyHours"),
      value: hoursOf(DAY_FIELDS.reduce((sum, field) => sum + week[field], 0)),
    },
    { label: t("terms.week.bankHolidays"), value: calendarName(week.bankHolidayCalendar) },
  ];
}
