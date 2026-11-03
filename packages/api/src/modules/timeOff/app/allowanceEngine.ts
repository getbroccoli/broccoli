import type { Tx } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS, type BankHolidayService } from "../../bankHolidays";
import type { EmployeeReadService, EmployeeWorkingPatternService } from "../../employees";
import { type Allowance, allowanceRepository, timeOffPolicyRepository } from "../db";
import {
  type AllowanceCause,
  type AllowanceInputs,
  calculateAllowance,
  type DatedPolicy,
  leaveYearContaining,
  ledgerDifference,
  type NewLedgerLine,
  type PolicyTimeline,
  policyIdOn,
  policyStretches,
  type TimeOffPolicy,
} from "../domain";

/** What one run of the engine wrote. */
export interface EnsuredAllowances {
  allowancesCreated: number;
  linesAppended: number;
}

export interface AllowanceEngineDependencies {
  employeeReads: Pick<
    EmployeeReadService,
    "lockEmployees" | "readEmploymentPeriods" | "readTermsMemberships"
  >;
  workingWeeks: Pick<EmployeeWorkingPatternService, "readWorkingWeeksInTransaction">;
  bankHolidays: BankHolidayService;
  /** The engine's date: leave years that ended before it are never recalculated. */
  today: () => CalendarDate;
}

/**
 * Creates each employee's allowance for the leave year they are in, or start in, and brings every
 * allowance whose leave year has not ended to its target by appending the difference.
 */
export async function ensureAllowancesOf(
  dependencies: AllowanceEngineDependencies,
  tx: Tx,
  { employeeIds, cause }: { employeeIds: readonly string[]; cause: AllowanceCause },
): Promise<EnsuredAllowances> {
  const ids = await dependencies.employeeReads.lockEmployees(tx, employeeIds);
  if (ids.length === 0) {
    return { allowancesCreated: 0, linesAppended: 0 };
  }
  const allowances = allowanceRepository(tx);
  const { people, policies } = await readPeople(dependencies.employeeReads, tx, ids);
  const today = dependencies.today();
  const created = await allowances.insert(missingAllowances(people, policies, today));
  const open = [
    ...people.flatMap(({ allowances: own }) =>
      own.filter(({ leaveYearEnd }) => leaveYearEnd >= today),
    ),
    ...created,
  ];
  const lines = await differenceLines(dependencies, tx, { people, policies, open, cause });
  return { allowancesCreated: created.length, linesAppended: await allowances.insertLines(lines) };
}

interface Person {
  employeeId: string;
  periods: readonly { startDate: CalendarDate | null; endDate: CalendarDate | null }[];
  serviceStart: CalendarDate | null;
  timeline: PolicyTimeline;
  allowances: readonly Allowance[];
}

/** Every policy, and what decides each person's allowances. */
async function readPeople(
  employeeReads: AllowanceEngineDependencies["employeeReads"],
  tx: Tx,
  ids: readonly string[],
): Promise<{ people: Person[]; policies: TimeOffPolicy[] }> {
  const policyRepository = timeOffPolicyRepository(tx);
  const [policies, employments, memberships, assignments, existing] = await Promise.all([
    policyRepository.findAll(),
    employeeReads.readEmploymentPeriods(tx, ids),
    employeeReads.readTermsMemberships(tx, ids),
    policyRepository.findAssignments(ids),
    allowanceRepository(tx).findByEmployees(ids),
  ]);
  const termsIds = [...memberships.values()].flat().map(({ termsId }) => termsId);
  const termsLinks = await policyRepository.findTermsLinks([...new Set(termsIds)]);
  const existingOf = Map.groupBy(existing, ({ employeeId }) => employeeId);
  const people = ids.map((employeeId) => {
    const periods = employments.get(employeeId) ?? [];
    return {
      employeeId,
      periods,
      serviceStart: periods[0]?.startDate ?? null,
      timeline: {
        assignments: assignments.get(employeeId) ?? [],
        memberships: memberships.get(employeeId) ?? [],
        termsLinks,
      },
      allowances: existingOf.get(employeeId) ?? [],
    };
  });
  return { people, policies };
}

/** The allowances to create: one per person and type that has none for the year needed. */
function missingAllowances(
  people: readonly Person[],
  policies: readonly TimeOffPolicy[],
  today: CalendarDate,
) {
  const typeIds = [...new Set(policies.map(({ timeOffType }) => timeOffType.id))];
  return people.flatMap((person) =>
    typeIds.flatMap((typeId) => {
      const allowance = newAllowance(person, policies, typeId, today);
      return allowance ? [{ employeeId: person.employeeId, ...allowance }] : [];
    }),
  );
}

/** The lines that bring each open allowance to its target. */
async function differenceLines(
  { workingWeeks, bankHolidays }: AllowanceEngineDependencies,
  tx: Tx,
  {
    people,
    policies,
    open,
    cause,
  }: {
    people: readonly Person[];
    policies: readonly TimeOffPolicy[];
    open: readonly Allowance[];
    cause: AllowanceCause;
  },
): Promise<NewLedgerLine[]> {
  if (open.length === 0) {
    return [];
  }
  const from = open.map(({ leaveYearStart }) => leaveYearStart).toSorted()[0]!;
  const until = open
    .map(({ leaveYearEnd }) => leaveYearEnd)
    .toSorted()
    .at(-1)!;
  const [weeks, holidays, sums] = await Promise.all([
    workingWeeks.readWorkingWeeksInTransaction(tx, {
      employeeIds: [...new Set(open.map(({ employeeId }) => employeeId))],
      from,
      until,
    }),
    bankHolidays.readBankHolidays(PrincipalSecurityContext.system(), {
      calendars: BANK_HOLIDAY_CALENDARS,
      from,
      until,
    }),
    allowanceRepository(tx).findEngineSums(open.map(({ id }) => id)),
  ]);
  const holidayDates = new Map(
    [...holidays].map(([calendar, days]) => [calendar, days.map(({ date }) => date)]),
  );
  const personOf = new Map(people.map((person) => [person.employeeId, person]));
  return open.flatMap((allowance) => {
    const person = personOf.get(allowance.employeeId)!;
    const inputs: AllowanceInputs = {
      leaveYear: { start: allowance.leaveYearStart, end: allowance.leaveYearEnd },
      employments: person.periods,
      serviceStart: person.serviceStart,
      policies: datedPolicies(person.timeline, policies, allowance),
      workingWeeks: weeks.get(allowance.employeeId)!,
      bankHolidays: holidayDates,
    };
    const target = calculateAllowance(inputs);
    const previous =
      cause.kind === "START_DATE_CHANGED"
        ? calculateAllowance({
            ...inputs,
            serviceStart: cause.previousStartDate,
            employments: inputs.employments.map((period, index) =>
              index === 0 ? { ...period, startDate: cause.previousStartDate } : period,
            ),
          })
        : [];
    return ledgerDifference(allowance, target, sums.get(allowance.id) ?? [], cause, previous);
  });
}

/**
 * The allowance a person needs for a type: for the leave year of the policy applying on the later
 * of today and their start, unless one already overlaps it or they are employed on none of its days.
 */
function newAllowance(
  person: Person,
  policies: readonly TimeOffPolicy[],
  timeOffTypeId: string,
  today: CalendarDate,
): Pick<Allowance, "timeOffTypeId" | "leaveYearStart" | "leaveYearEnd"> | null {
  const anchor = person.serviceStart && person.serviceStart > today ? person.serviceStart : today;
  const policyId = policyIdOn(person.timeline, timeOffTypeId, anchor);
  const policy = policies.find(({ id }) => id === policyId);
  if (!policy?.leaveYear) {
    return null;
  }
  const { start, end } = leaveYearContaining(policy.leaveYear, person.serviceStart, anchor);
  const overlaps = person.allowances.some(
    (allowance) =>
      allowance.timeOffTypeId === timeOffTypeId &&
      allowance.leaveYearStart <= end &&
      allowance.leaveYearEnd >= start,
  );
  const employed = person.periods.some(
    ({ startDate, endDate }) =>
      (startDate === null || startDate <= end) && (endDate === null || endDate >= start),
  );
  return overlaps || !employed ? null : { timeOffTypeId, leaveYearStart: start, leaveYearEnd: end };
}

function datedPolicies(
  timeline: PolicyTimeline,
  policies: readonly TimeOffPolicy[],
  allowance: Allowance,
): DatedPolicy[] {
  return policyStretches(
    timeline,
    allowance.timeOffTypeId,
    allowance.leaveYearStart,
    allowance.leaveYearEnd,
  ).map(({ timeOffPolicyId, effectiveFrom, effectiveUntil }) => {
    const policy = policies.find(({ id }) => id === timeOffPolicyId)!;
    return {
      effectiveFrom,
      effectiveUntil,
      balance: policy.balance,
      bankHolidays: policy.bankHolidays,
      rules: policy.rules,
    };
  });
}
