import { useNavigate, useRouteContext } from "@tanstack/react-router";

import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { companyToday } from "@/features/termsDisplay";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";
import { formatDays } from "@/lib/formatDays";

import { AllowanceCard } from "./AllowanceCard";
import { modeOf, type Permit, recordedLine, waitingLine } from "./timeOffRequestText";
import { TimeOffRequests } from "./TimeOffRequests";

type TimeOffType = NonNullable<EmployeePanel_EmployeeFragment["timeOffTypes"]>[number];

type Props = {
  person: { id: string; firstName: string };
  /** The person's time off types, Annual leave first; the caller may read them. */
  timeOffTypes: readonly TimeOffType[];
  /** Whether the viewer books this person's time off straight away, asks for it, or neither. */
  permit: Permit;
  /** The person's requests this leave year; null for who may not read them. */
  requests: EmployeePanel_EmployeeFragment["timeOffRequests"];
};

/** A person's time off in their current leave year: allowances first, then what is only recorded. */
export function TimeOffSection({ person, timeOffTypes, permit, requests }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const navigate = useNavigate();
  const mode = modeOf(permit);
  // shortcut: adjusting follows the admin grant until profiles grant it by scope.
  const adjustFor = me.operations.includes("MANAGE_WORKSPACE")
    ? { firstName: person.firstName, isReader: me.employee?.id === person.id }
    : undefined;
  const first = timeOffTypes[0];
  const allowances = timeOffTypes.filter(({ balance }) => balance !== "NO_BALANCE");
  const recorded = timeOffTypes.filter(({ balance }) => balance === "NO_BALANCE");

  return (
    <section aria-labelledby="employee-time-off" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="employee-time-off"
          className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
        >
          {first
            ? t("people.panel.timeOff.title", { period: periodOf(first) })
            : t("people.panel.timeOff.titleWithoutPeriod")}
        </h2>
        {mode && (
          <Button
            variant="ghost"
            size="sm"
            // The Time off page opens the dialog for this person, and Back closes it again.
            onClick={() =>
              void navigate({
                to: "/time-off",
                search: { book: person.id, month: companyToday().slice(0, 7) },
              })
            }
          >
            {mode === "book" ? t("people.panel.timeOff.book") : t("timeOff.request")}
          </Button>
        )}
      </div>
      {!first && <p className="text-sm text-muted-foreground">{t("people.panel.timeOff.empty")}</p>}
      {allowances.map((type) =>
        type.balance === "BALANCE_FROM_ALLOWANCE" ? (
          <AllowanceCard
            // A new leave year is a new card: an open adjustment never moves to it.
            key={type.allowanceId ?? type.timeOffType.id}
            employeeId={person.id}
            type={type}
            period={{ label: periodOf(type), shownOnCard: differsFrom(type, first) }}
            adjustFor={adjustFor}
          />
        ) : (
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
            <p className="px-3 py-2.5 text-sm">
              {t("people.panel.timeOff.unlimited", { days: formatDays(type.used) })}
            </p>
            {waitingLine(type.waiting) && (
              <p className="px-3 pb-2.5 text-[13px] text-amber-900">{waitingLine(type.waiting)}</p>
            )}
          </section>
        ),
      )}
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
              <dd className="text-muted-foreground">{recordedLine(type.used, type.waiting)}</dd>
            </div>
          ))}
        </dl>
      )}
      {requests && <TimeOffRequests employeeId={person.id} requests={requests} />}
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
