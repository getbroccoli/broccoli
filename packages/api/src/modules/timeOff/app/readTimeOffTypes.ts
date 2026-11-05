import type { Transact, Tx } from "../../../core/db";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { type Allowance, allowanceRepository, timeOffRepository } from "../db";
import {
  type LedgerLineKind,
  policyIdOn,
  type TimeOffPolicy,
  timeOffFigures,
  type TimeOffType,
  type TimeOffTypeKey,
} from "../domain";
import { type AllowanceEngineDependencies, type Person, readPeople } from "./allowanceEngine";

/** One time off type a person has in their current leave year, with its figures in days. */
export interface EmployeeTimeOffType {
  timeOffType: TimeOffType;
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
  employeeId: string;
  policy: TimeOffPolicy;
  period: { start: CalendarDate; end: CalendarDate };
  allowance: Allowance | null;
}

/** What the shown types' figures are made of: ledger sums by allowance, and days recorded. */
interface Figures {
  sums: Map<string, { kind: LedgerLineKind; amount: number }[]>;
  recorded: { employeeId: string; timeOffTypeId: string; year: number; days: number }[];
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
  const ids = await readableIds(ctx, input.employeeIds);
  if (ids.length === 0) {
    return new Map();
  }
  return transact(async (tx) => {
    const { people, policies } = await readPeople(employeeReads, tx, ids);
    const shown = people.map((person) => shownTypes(person, policies, today()));
    const figures = await readFigures(tx, ids, shown.flat());
    return new Map(
      people.map(({ employeeId }, index) => [
        employeeId,
        shown[index]!.map((type) => toEmployeeTimeOffType(type, figures)),
      ]),
    );
  });
}

async function readableIds(
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<string[]> {
  const scope = await ctx.recordScope("time_off", "read");
  return [...new Set(employeeIds.map(parseUuid).filter((id): id is string => id !== null))].filter(
    (id) => isInRecordScope(scope, id),
  );
}

/** The person's types on today, or on their start when it is later, Annual leave first. */
function shownTypes(
  person: Person,
  policies: readonly TimeOffPolicy[],
  today: CalendarDate,
): ShownType[] {
  const date = person.serviceStart && person.serviceStart > today ? person.serviceStart : today;
  const types = new Map(policies.map(({ timeOffType }) => [timeOffType.id, timeOffType]));
  return [...types.values()].sort(byTypeOrder).flatMap((type) => {
    const policy = policies.find(({ id }) => id === policyIdOn(person.timeline, type.id, date));
    const shown = policy && shownType(person, policy, date);
    return shown ? [shown] : [];
  });
}

/** The type under `policy` on `date`, or null when the person has no period to show for it. */
function shownType(person: Person, policy: TimeOffPolicy, date: CalendarDate): ShownType | null {
  const { employeeId } = person;
  if (policy.balance === "no_balance") {
    const year = calendarYearOf(date);
    return person.periods.some((period) => overlaps(period, year))
      ? { employeeId, policy, period: year, allowance: null }
      : null;
  }
  const allowance = person.allowances.find(
    ({ timeOffTypeId, leaveYearStart, leaveYearEnd }) =>
      timeOffTypeId === policy.timeOffType.id && leaveYearStart <= date && date <= leaveYearEnd,
  );
  return allowance
    ? {
        employeeId,
        policy,
        period: { start: allowance.leaveYearStart, end: allowance.leaveYearEnd },
        allowance,
      }
    : null;
}

async function readFigures(
  tx: Tx,
  employeeIds: readonly string[],
  shown: readonly ShownType[],
): Promise<Figures> {
  const allowanceIds = shown.flatMap(({ allowance }) => (allowance ? [allowance.id] : []));
  const years = shown.flatMap(({ period, allowance }) => (allowance ? [] : [period]));
  const sums = await allowanceRepository(tx).findSumsByKind(allowanceIds);
  const recorded =
    years.length === 0
      ? []
      : await timeOffRepository(tx).sumRecordedDays({
          employeeIds,
          from: years.map(({ start }) => start).sort()[0]!,
          until: years
            .map(({ end }) => end)
            .sort()
            .at(-1)!,
        });
  return { sums, recorded };
}

function toEmployeeTimeOffType(
  { employeeId, policy, period, allowance }: ShownType,
  { sums, recorded }: Figures,
): EmployeeTimeOffType {
  const { timeOffType, balance } = policy;
  const row = { timeOffType, balance, periodStart: period.start, periodEnd: period.end };
  const noFigures = { entitlement: null, bankHolidays: null, remaining: null };
  if (!allowance) {
    const days = recorded.find(
      (line) =>
        line.employeeId === employeeId &&
        line.timeOffTypeId === timeOffType.id &&
        line.year === Number(period.start.slice(0, 4)),
    );
    return { ...row, ...noFigures, used: days?.days ?? 0 };
  }
  const figures = timeOffFigures(sums.get(allowance.id) ?? []);
  return balance === "balance_from_allowance"
    ? { ...row, ...figures }
    : { ...row, ...noFigures, used: figures.used };
}

/** Annual leave, Sickness, Family leave, Other, then the company's own types by name. */
export function byTypeOrder(
  a: { name: string; typeKey: TimeOffTypeKey | null },
  b: { name: string; typeKey: TimeOffTypeKey | null },
): number {
  const rank = ({ typeKey }: { typeKey: TimeOffTypeKey | null }) =>
    typeKey === null ? TYPE_ORDER.length : TYPE_ORDER.indexOf(typeKey);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

export function calendarYearOf(date: CalendarDate): { start: CalendarDate; end: CalendarDate } {
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
