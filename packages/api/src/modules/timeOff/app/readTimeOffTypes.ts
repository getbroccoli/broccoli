import type { Transact } from "../../../core/db";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { type Allowance, allowanceRepository, timeOffRepository } from "../db";
import { policyIdOn, type TimeOffPolicy, timeOffFigures, type TimeOffTypeKey } from "../domain";
import { type AllowanceEngineDependencies, readPeople } from "./allowanceEngine";

/** One time off type a person has in their current leave year, with its figures in days. */
export interface EmployeeTimeOffType {
  timeOffType: { id: string; name: string; typeKey: TimeOffTypeKey | null };
  balance: TimeOffPolicy["balance"];
  /** The leave year, or the calendar year for a type with no balance. */
  periodStart: CalendarDate;
  periodEnd: CalendarDate;
  /** Set on `balance_from_allowance` only. */
  entitlement: number | null;
  bankHolidays: number | null;
  remaining: number | null;
  /** Days used from an allowance, or recorded for a type with no balance, in the period. */
  used: number;
}

type Dependencies = Pick<AllowanceEngineDependencies, "employeeReads" | "today"> & {
  transact: Transact;
};

/** A type to show for one person: its policy, the period read and, unless it has no balance, the allowance. */
interface ShownType {
  policy: TimeOffPolicy;
  period: { start: CalendarDate; end: CalendarDate };
  allowance: Allowance | null;
}

const TYPE_ORDER: readonly TimeOffTypeKey[] = ["annual_leave", "sickness", "family_leave", "other"];

/**
 * Each in-scope employee's time off types for the leave year containing today, or their start
 * when it is later, by id; ids the caller may not read are left out.
 */
export async function readTimeOffTypes(
  { transact, employeeReads, today }: Dependencies,
  ctx: SecurityContext,
  input: { employeeIds: readonly string[] },
): Promise<Map<string, EmployeeTimeOffType[]>> {
  const scope = await ctx.recordScope("time_off", "read");
  const ids = [
    ...new Set(input.employeeIds.map(parseUuid).filter((id): id is string => id !== null)),
  ].filter((id) => isInRecordScope(scope, id));
  if (ids.length === 0) {
    return new Map();
  }
  return transact(async (tx) => {
    const { people, policies } = await readPeople(employeeReads, tx, ids);
    const types = [
      ...new Map(policies.map(({ timeOffType }) => [timeOffType.id, timeOffType])).values(),
    ].sort(byTypeOrder);
    const rows = people.map((person) => {
      const date =
        person.serviceStart && person.serviceStart > today() ? person.serviceStart : today();
      return types.flatMap((type): ShownType[] => {
        const policy = policies.find(({ id }) => id === policyIdOn(person.timeline, type.id, date));
        if (!policy) {
          return [];
        }
        if (policy.balance === "no_balance") {
          const year = calendarYearOf(date);
          return person.periods.some((period) => overlaps(period, year))
            ? [{ policy, period: year, allowance: null }]
            : [];
        }
        const allowance = person.allowances.find(
          ({ timeOffTypeId, leaveYearStart, leaveYearEnd }) =>
            timeOffTypeId === type.id && leaveYearStart <= date && date <= leaveYearEnd,
        );
        return allowance
          ? [
              {
                policy,
                period: { start: allowance.leaveYearStart, end: allowance.leaveYearEnd },
                allowance,
              },
            ]
          : [];
      });
    });

    const shown = rows.flat();
    const sums = await allowanceRepository(tx).findSumsByKind(
      shown.flatMap(({ allowance }) => (allowance ? [allowance.id] : [])),
    );
    const years = shown.flatMap(({ period, allowance }) => (allowance ? [] : [period]));
    const recorded =
      years.length === 0
        ? []
        : await timeOffRepository(tx).sumRecordedDays({
            employeeIds: ids,
            from: years.map(({ start }) => start).sort()[0]!,
            until: years
              .map(({ end }) => end)
              .sort()
              .at(-1)!,
          });

    return new Map(
      people.map(({ employeeId }, index) => [
        employeeId,
        rows[index]!.map(({ policy, period, allowance }): EmployeeTimeOffType => {
          const { timeOffType, balance } = policy;
          const dates = { periodStart: period.start, periodEnd: period.end };
          if (!allowance) {
            const days = recorded.find(
              (row) =>
                row.employeeId === employeeId &&
                row.timeOffTypeId === timeOffType.id &&
                row.year === Number(period.start.slice(0, 4)),
            );
            return {
              timeOffType,
              balance,
              ...dates,
              entitlement: null,
              bankHolidays: null,
              remaining: null,
              used: days?.days ?? 0,
            };
          }
          const figures = timeOffFigures(sums.get(allowance.id) ?? []);
          const fromAllowance = balance === "balance_from_allowance";
          return {
            timeOffType,
            balance,
            ...dates,
            entitlement: fromAllowance ? figures.entitlement : null,
            bankHolidays: fromAllowance ? figures.bankHolidays : null,
            remaining: fromAllowance ? figures.remaining : null,
            used: figures.used,
          };
        }),
      ]),
    );
  });
}

function byTypeOrder(
  a: { name: string; typeKey: TimeOffTypeKey | null },
  b: { name: string; typeKey: TimeOffTypeKey | null },
): number {
  const rank = ({ typeKey }: { typeKey: TimeOffTypeKey | null }) =>
    typeKey === null ? TYPE_ORDER.length : TYPE_ORDER.indexOf(typeKey);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

function calendarYearOf(date: CalendarDate): { start: CalendarDate; end: CalendarDate } {
  const year = date.slice(0, 4);
  return { start: `${year}-01-01` as CalendarDate, end: `${year}-12-31` as CalendarDate };
}

function overlaps(
  period: { startDate: CalendarDate | null; endDate: CalendarDate | null },
  range: { start: CalendarDate; end: CalendarDate },
): boolean {
  return (
    (period.startDate === null || period.startDate <= range.end) &&
    (period.endDate === null || period.endDate >= range.start)
  );
}
