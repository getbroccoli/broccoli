import { CalendarBlank } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { EmploymentTermsStackQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import {
  calendarName,
  companyToday,
  DAY_FIELDS,
  DAY_NAMES,
  hoursOf,
  plannedWeekLine,
  splitVersions,
  weekSummary,
} from "@/features/termsDisplay";

import { DraftPill } from "./DraftPill";

type Terms = NonNullable<EmploymentTermsStackQuery["terms"]>;
type Version = Terms["workingWeek"][number];

type Props = {
  versions: Version[];
  /** The week saved and not published yet; null while there is none. */
  unpublished: Terms["unpublishedWorkingWeek"];
  /** The open form in place of today's week; null while the section is closed. */
  editor: ReactNode;
  onEdit: () => void;
  onCancelPlanned: (version: Version) => void;
  onDiscard: () => void;
};

/** The terms' working week today, day by day, with any planned and unpublished week under it. */
export function WorkingWeekSection({
  versions,
  unpublished,
  editor,
  onEdit,
  onCancelPlanned,
  onDiscard,
}: Props) {
  const { current, planned } = splitVersions(versions, companyToday());
  return (
    <section aria-labelledby="terms-week" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="terms-week" className="text-[17px] font-semibold">
          {t("terms.week.title")}
        </h3>
        {!editor && (current || unpublished) && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            {t("terms.edit.edit")}
          </Button>
        )}
      </div>
      {editor ? (
        editor
      ) : current ? (
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
        <p className="text-sm text-muted-foreground">{t("terms.week.notSet")}</p>
      )}
      {planned.map((version) => (
        <div key={version.id} className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CalendarBlank aria-hidden className="shrink-0" />
          <span className="flex-1">
            {`${plannedWeekLine(version)}, ${t("terms.bankHolidays", {
              calendar: calendarName(version.bankHolidayCalendar),
            })}`}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onCancelPlanned(version)}>
            {t("terms.edit.cancelChange")}
          </Button>
        </div>
      ))}
      {unpublished && !editor && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <DraftPill />
          <span className="flex-1">
            {`${weekSummary(unpublished)}, ${t("terms.bankHolidays", {
              calendar: calendarName(unpublished.bankHolidayCalendar),
            })}`}
          </span>
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            {t("terms.edit.discard")}
          </Button>
        </div>
      )}
    </section>
  );
}

/** The facts under the day cells: weekly hours and whose bank holidays. */
function weekFacts(week: Version): { label: string; value: string }[] {
  return [
    {
      label: t("terms.week.weeklyHours"),
      value: hoursOf(DAY_FIELDS.reduce((sum, field) => sum + week[field], 0)),
    },
    { label: t("terms.week.bankHolidays"), value: calendarName(week.bankHolidayCalendar) },
  ];
}
