import type { Transact } from "../../../core/db";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import type { EmployeeReadService } from "../../employees";
import { allowanceRepository, timeOffPolicyRepository, timeOffRepository } from "../db";
import { policyIdOn, type TimeOffPolicy, timeOffFigures, type TimeOffTypeKey } from "../domain";

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

type Dependencies = {
  transact: Transact;
  employeeReads: Pick<EmployeeReadService, "readEmploymentPeriods" | "readTermsMemberships">;
  today: () => CalendarDate;
};

const TYPE_ORDER: readonly (TimeOffTypeKey | null)[] = [
  "annual_leave",
  "sickness",
  "family_leave",
  "other",
];

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
    const policyRepository = timeOffPolicyRepository(tx);
    const [policies, employments, memberships, assignments, allowances] = await Promise.all([
      policyRepository.findAll(),
      employeeReads.readEmploymentPeriods(tx, ids),
      employeeReads.readTermsMemberships(tx, ids),
      policyRepository.findAssignments(ids),
      allowanceRepository(tx).findByEmployees(ids),
    ]);
    const termsIds = [...memberships.values()].flat().map(({ termsId }) => termsId);
    const termsLinks = await policyRepository.findTermsLinks([...new Set(termsIds)]);
    const types = [
      ...new Map(policies.map(({ timeOffType }) => [timeOffType.id, timeOffType])).values(),
    ].sort(byTypeOrder);

    const people = ids.map((employeeId) => {
      const periods = employments.get(employeeId) ?? [];
      const start = periods[0]?.startDate ?? null;
      const referenceDate = start && start > today() ? start : today();
      const timeline = {
        assignments: assignments.get(employeeId) ?? [],
        memberships: memberships.get(employeeId) ?? [],
        termsLinks,
      };
      const applying = types.flatMap((type) => {
        const policyId = policyIdOn(timeline, type.id, referenceDate);
        const policy = policies.find(({ id }) => id === policyId);
        return policy ? [policy] : [];
      });
      return { employeeId, periods, referenceDate, applying };
    });

    const shown = people.flatMap(({ employeeId, referenceDate, applying }) =>
      applying
        .filter(({ balance }) => balance !== "no_balance")
        .map(({ timeOffType }) =>
          allowances.find(
            (allowance) =>
              allowance.employeeId === employeeId &&
              allowance.timeOffTypeId === timeOffType.id &&
              allowance.leaveYearStart <= referenceDate &&
              referenceDate <= allowance.leaveYearEnd,
          ),
        )
        .filter((allowance) => allowance !== undefined),
    );
    const sums = await allowanceRepository(tx).findSumsByKind(shown.map(({ id }) => id));
    const years = people.map(({ referenceDate }) => calendarYearOf(referenceDate));
    const recorded = await timeOffRepository(tx).sumRecordedDays({
      employeeIds: ids,
      from: years.map(({ start }) => start).sort()[0]!,
      until: years
        .map(({ end }) => end)
        .sort()
        .at(-1)!,
    });

    return new Map(
      people.map(({ employeeId, periods, referenceDate, applying }) => [
        employeeId,
        applying.flatMap((policy): EmployeeTimeOffType[] => {
          const timeOffType = policy.timeOffType;
          if (policy.balance === "no_balance") {
            const year = calendarYearOf(referenceDate);
            if (!periods.some((period) => overlaps(period, year))) {
              return [];
            }
            const days = recorded.find(
              (row) =>
                row.employeeId === employeeId &&
                row.timeOffTypeId === timeOffType.id &&
                row.year === Number(referenceDate.slice(0, 4)),
            );
            return [
              {
                timeOffType,
                balance: policy.balance,
                periodStart: year.start,
                periodEnd: year.end,
                entitlement: null,
                bankHolidays: null,
                remaining: null,
                used: days?.days ?? 0,
              },
            ];
          }
          const allowance = shown.find(
            (candidate) =>
              candidate.employeeId === employeeId && candidate.timeOffTypeId === timeOffType.id,
          );
          if (!allowance) {
            return [];
          }
          const figures = timeOffFigures(sums.get(allowance.id) ?? []);
          const fromAllowance = policy.balance === "balance_from_allowance";
          return [
            {
              timeOffType,
              balance: policy.balance,
              periodStart: allowance.leaveYearStart,
              periodEnd: allowance.leaveYearEnd,
              entitlement: fromAllowance ? figures.entitlement : null,
              bankHolidays: fromAllowance ? figures.bankHolidays : null,
              remaining: fromAllowance ? figures.remaining : null,
              used: figures.used,
            },
          ];
        }),
      ]),
    );
  });
}

function byTypeOrder(
  a: { name: string; typeKey: TimeOffTypeKey | null },
  b: { name: string; typeKey: TimeOffTypeKey | null },
): number {
  const rank = (type: { typeKey: TimeOffTypeKey | null }) =>
    type.typeKey === null ? TYPE_ORDER.length : TYPE_ORDER.indexOf(type.typeKey);
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
