import { useQuery } from "@apollo/client/react";
import { CalendarPlus } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { TodayMyTimeOffDocument } from "@/__generated__/graphql";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { modeOf, TimeOffStatusChip } from "@/features/employees";
import { t } from "@/i18n";
import { addDays } from "@/lib/calendarDay";
import { dateRange } from "@/lib/formatDate";
import { formatDayCount, formatDays } from "@/lib/formatDays";

import { LoadFailed } from "./LoadFailed";
import { upcomingTimeOff } from "./upcomingTimeOff";

type Props = { employeeId: string; today: string };

/** The signed-in person's leave: what is left of their first allowance, what is coming, and asking for more. */
export function MyTimeOffCard({ employeeId, today }: Props) {
  const { data, error, refetch } = useQuery(TodayMyTimeOffDocument, {
    variables: { id: employeeId, from: today, until: addDays(today, WHOS_OUT_MAX_DAYS - 1) },
    fetchPolicy: "cache-and-network",
  });
  const employee = data?.employee;
  if (!employee) {
    return (
      <Card title={t("today.timeOff.title")}>
        {error && <LoadFailed onRetry={() => void refetch()} />}
      </Card>
    );
  }
  const allowance = employee.timeOffTypes?.find(
    ({ balance }) => balance === "BALANCE_FROM_ALLOWANCE",
  );
  const coming = upcomingTimeOff(employee.whosOut.timeOff, today).slice(0, SHOWN);
  // Without a time off type of their own there is nothing to ask for.
  const mode = employee.timeOffTypes?.length ? modeOf(employee.canCreateTimeOff) : null;

  return (
    <Card
      title={t("today.timeOff.title")}
      action={
        <Link
          to="/time-off"
          search={{ month: today.slice(0, 7) }}
          className="text-sm font-medium hover:underline"
        >
          {t("today.timeOff.seeAll")}
        </Link>
      }
    >
      {allowance?.remaining != null && allowance.entitlement != null && (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatDayCount(allowance.remaining)}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("today.timeOff.left", {
                days: formatDays(allowance.entitlement),
                name: allowance.timeOffType.name,
              })}
            </span>
          </p>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${shareLeft(allowance.remaining, allowance.entitlement) * 100}%` }}
            />
          </div>
        </div>
      )}
      {coming.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("today.timeOff.nothingBooked")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {coming.map((timeOff) => (
            <li
              key={timeOff.id}
              className="flex items-center gap-3 rounded-xl bg-sidebar px-3 py-2.5 text-sm"
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-medium">{dateRange(timeOff.startDate, timeOff.endDate)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {timeOff.timeOffType?.name}
                </span>
              </div>
              <TimeOffStatusChip status={timeOff.status!} ending={NO_ENDING} />
            </li>
          ))}
        </ul>
      )}
      {mode && (
        <Link
          to="/time-off"
          // The Time off page opens the dialog for this person, and Back closes it again.
          search={{ book: employeeId, month: today.slice(0, 7) }}
          className={buttonVariants({ className: "h-9 w-full" })}
        >
          <CalendarPlus aria-hidden />
          {mode === "book" ? t("timeOff.book") : t("timeOff.request")}
        </Link>
      )}
    </Card>
  );
}

/** What is left of an allowance, from 0 to 1, for its bar; days taken beyond it show an empty bar. */
function shareLeft(remaining: number, entitlement: number): number {
  return entitlement > 0 ? Math.min(Math.max(remaining / entitlement, 0), 1) : 0;
}

/** The most days `whosOut` reads at once; Today looks that far ahead for the person's own time off. */
const WHOS_OUT_MAX_DAYS = 62;
/** Today shows the next few; the person's panel has them all. */
const SHOWN = 2;
/** Requested or approved time off has no ending, so the chip never reads one. */
const NO_ENDING = { hasDecision: false, cancelledBy: null };
