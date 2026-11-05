import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";
import { formatDays } from "@/lib/formatDays";

import { TimeOffFigure } from "./TimeOffFigure";

type TimeOffType = NonNullable<EmployeePanel_EmployeeFragment["timeOffTypes"]>[number];

type Props = {
  /** The person's time off types, Annual leave first; the caller may read them. */
  timeOffTypes: readonly TimeOffType[];
};

const dayCount = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** A person's time off in their current leave year: allowances first, then what is only recorded. */
export function TimeOffSection({ timeOffTypes }: Props) {
  const first = timeOffTypes[0];
  const allowances = timeOffTypes.filter(({ balance }) => balance !== "NO_BALANCE");
  const recorded = timeOffTypes.filter(({ balance }) => balance === "NO_BALANCE");

  return (
    <section aria-labelledby="employee-time-off" className="flex flex-col gap-2">
      <h2
        id="employee-time-off"
        className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
      >
        {first
          ? t("people.panel.timeOff.title", { period: periodOf(first) })
          : t("people.panel.timeOff.titleWithoutPeriod")}
      </h2>
      {!first && <p className="text-sm text-muted-foreground">{t("people.panel.timeOff.empty")}</p>}
      {allowances.map((type) => (
        <section
          key={type.timeOffType.id}
          aria-label={type.timeOffType.name}
          className="overflow-hidden rounded-xl border border-border"
        >
          <h3 className="flex justify-between gap-2 border-b border-border/60 bg-sidebar px-3 py-2 text-[13px] font-medium">
            {type.timeOffType.name}
            {differsFrom(type, first) && (
              <span className="font-normal text-muted-foreground">{periodOf(type)}</span>
            )}
          </h3>
          {type.balance === "BALANCE_FROM_ALLOWANCE" ? (
            <dl className="grid grid-cols-2 gap-x-2 gap-y-3 px-3 py-2.5 sm:grid-cols-4">
              <TimeOffFigure
                label={t("people.panel.timeOff.entitlement")}
                value={dayCount.format(type.entitlement ?? 0)}
              />
              <TimeOffFigure
                label={t("people.panel.timeOff.bankHolidays")}
                value={dayCount.format(type.bankHolidays ?? 0)}
              />
              <TimeOffFigure
                label={t("people.panel.timeOff.used")}
                value={dayCount.format(type.used)}
              />
              <TimeOffFigure
                label={t("people.panel.timeOff.remaining")}
                value={dayCount.format(type.remaining ?? 0)}
                emphasis
              />
            </dl>
          ) : (
            <p className="px-3 py-2.5 text-sm">
              {t("people.panel.timeOff.unlimited", { days: formatDays(type.used) })}
            </p>
          )}
        </section>
      ))}
      {recorded.length > 0 && (
        <dl className="overflow-hidden rounded-xl border border-border text-sm">
          {recorded.map((type) => (
            <div
              key={type.timeOffType.id}
              className="flex justify-between gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
            >
              <dt>
                {type.timeOffType.name}
                {differsFrom(type, first) && (
                  <span className="ml-2 text-muted-foreground">{periodOf(type)}</span>
                )}
              </dt>
              <dd className="text-muted-foreground">
                {t("people.panel.timeOff.recorded", { days: formatDays(type.used) })}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** "2026" for a calendar year, else the date range. */
function periodOf({ periodStart, periodEnd }: TimeOffType): string {
  const year = periodStart.slice(0, 4);
  return periodStart === `${year}-01-01` && periodEnd === `${year}-12-31`
    ? year
    : `${formatCalendarDate(periodStart)} – ${formatCalendarDate(periodEnd)}`;
}

function differsFrom(type: TimeOffType, first: TimeOffType | undefined): boolean {
  return type.periodStart !== first?.periodStart || type.periodEnd !== first?.periodEnd;
}
