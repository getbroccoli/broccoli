import { useQuery } from "@apollo/client/react";
import { CalendarPlus } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { TodayMyTimeOffDocument } from "@/__generated__/graphql";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { modeOf, TimeOffStatusChip } from "@/features/employees";
import { t } from "@/i18n";
import { dateRange } from "@/lib/formatDate";
import { formatDayCount } from "@/lib/formatDays";

import { upcomingTimeOff } from "./upcomingTimeOff";

type Props = { employeeId: string; today: string };

/** The signed-in person's leave: what is left of their first allowance, what is coming, and asking for more. */
export function MyTimeOffCard({ employeeId, today }: Props) {
  const { data } = useQuery(TodayMyTimeOffDocument, {
    variables: { id: employeeId },
    fetchPolicy: "cache-and-network",
  });
  const employee = data?.employee;
  if (!employee) return null;
  const allowance = employee.timeOffTypes?.find(
    ({ balance }) => balance === "BALANCE_FROM_ALLOWANCE",
  );
  const coming = upcomingTimeOff(employee.timeOffRequests ?? [], today).slice(0, SHOWN);
  const mode = modeOf(employee.canCreateTimeOff);

  return (
    <Card
      title={t("today.timeOff.title")}
      action={
        <Link to="/me" className="text-sm font-medium hover:underline">
          {t("today.timeOff.seeAll")}
        </Link>
      }
    >
      {allowance?.remaining != null && allowance.entitlement != null && (
        <AllowanceLeft
          name={allowance.timeOffType.name}
          remaining={allowance.remaining}
          entitlement={allowance.entitlement}
        />
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
              {/* Only requested or approved time off is coming, so how a request ended never shows. */}
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

function AllowanceLeft({
  name,
  remaining,
  entitlement,
}: {
  name: string;
  remaining: number;
  entitlement: number;
}) {
  const share = entitlement > 0 ? Math.min(Math.max(remaining / entitlement, 0), 1) : 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatDayCount(remaining)}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("today.timeOff.left", { entitlement: formatDayCount(entitlement), name })}
        </span>
      </p>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

const SHOWN = 2;
const NO_ENDING = { hasDecision: false, cancelledBy: null };
