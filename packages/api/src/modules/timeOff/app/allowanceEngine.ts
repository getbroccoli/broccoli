import type { Tx } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS, type BankHolidayService } from "../../bankHolidays";
import {
  type EmployeeReadService,
  type EmployeeWorkingPatternService,
  type PersonTimeline,
  createPersonTimeline,
} from "../../employees";
import { type Allowance, allowanceRepository, timeOffPolicyRepository } from "../db";
import {
  type AllowanceCause,
  type AllowanceInputs,
  calculateAllowance,
  type DatedPolicy,
  leaveYearContaining,
  ledgerDifference,
  type NewLedgerLine,
  type PolicyVersion,
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
  // Rules must not change or go, as deleting a type does, between reading them and writing lines.
  await timeOffPolicyRepository(tx).sharePolicies();
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
  const lines = await differenceLines(dependencies, tx, { people, open, cause });
  return { allowancesCreated: created.length, linesAppended: await allowances.insertLines(lines) };
}

/** What decides one person's allowances. */
export interface Person {
  employeeId: string;
  periods: readonly { startDate: CalendarDate | null; endDate: CalendarDate | null }[];
  serviceStart: CalendarDate | null;
  /** What decides the person's policy for one type. */
  timelineOf: (timeOffTypeId: string) => PersonTimeline<PolicyVersion>;
  allowances: readonly Allowance[];
}

/** Every policy, and what decides each person's allowances. */
export async function readPeople(
  employeeReads: Pick<
    AllowanceEngineDependencies["employeeReads"],
    "readEmploymentPeriods" | "readTermsMemberships"
  >,
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
  const byId = new Map(policies.map((policy) => [policy.id, policy]));
  const termsPolicyIds = new Map(
    policies.flatMap(({ id, termsId, timeOffType }) =>
      termsId ? [[`${termsId}:${timeOffType.id}`, id] as const] : [],
    ),
  );
  const existingOf = Map.groupBy(existing, ({ employeeId }) => employeeId);
  const people = ids.map((employeeId) => {
    const periods = employments.get(employeeId) ?? [];
    return {
      employeeId,
      periods,
      serviceStart: periods[0]?.startDate ?? null,
      timelineOf: (timeOffTypeId: string) =>
        createPersonTimeline({
          direct: (assignments.get(employeeId) ?? [])
            .filter((assignment) => assignment.timeOffTypeId === timeOffTypeId)
            .map(({ timeOffPolicyId, startDate, endDate }) => ({
              id: timeOffPolicyId,
              startDate,
              endDate,
            })),
          terms: memberships.get(employeeId) ?? [],
          idOfTerms: (termsId: string) => termsPolicyIds.get(`${termsId}:${timeOffTypeId}`) ?? null,
          versions: (policyId: string) => byId.get(policyId)?.versions ?? [],
        }),
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
      const allowance = newAllowance(person, typeId, today);
      return allowance ? [{ employeeId: person.employeeId, ...allowance }] : [];
    }),
  );
}

/** The lines that bring each open allowance to its target. */
async function differenceLines(
  dependencies: AllowanceEngineDependencies,
  tx: Tx,
  {
    people,
    open,
    cause,
  }: {
    people: readonly Person[];
    open: readonly Allowance[];
    cause: AllowanceCause;
  },
): Promise<NewLedgerLine[]> {
  if (open.length === 0) {
    return [];
  }
  const { weeks, holidayDates, sums } = await readFigures(dependencies, tx, open);
  const personOf = new Map(people.map((person) => [person.employeeId, person]));
  return open.flatMap((allowance) => {
    const person = personOf.get(allowance.employeeId)!;
    const inputs: AllowanceInputs = {
      leaveYear: { start: allowance.leaveYearStart, end: allowance.leaveYearEnd },
      employments: person.periods,
      serviceStart: person.serviceStart,
      policies: datedPolicies(person, allowance),
      workingWeeks: weeks.get(allowance.employeeId)!,
      bankHolidays: holidayDates,
    };
    return ledgerDifference(
      allowance,
      calculateAllowance(inputs),
      sums.get(allowance.id) ?? [],
      cause,
      previousCalculation(inputs, cause),
    );
  });
}

/** The working weeks, bank holidays and ledger sums the open allowances' calculations need. */
async function readFigures(
  { workingWeeks, bankHolidays }: AllowanceEngineDependencies,
  tx: Tx,
  open: readonly Allowance[],
) {
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
  return { weeks, holidayDates, sums };
}

/** A start correction's calculation from the previous start, so grants change from the right date. */
function previousCalculation(inputs: AllowanceInputs, cause: AllowanceCause) {
  if (cause.kind !== "START_DATE_CHANGED") {
    return [];
  }
  return calculateAllowance({
    ...inputs,
    serviceStart: cause.previousStartDate,
    employments: inputs.employments.map((period, index) =>
      index === 0 ? { ...period, startDate: cause.previousStartDate } : period,
    ),
  });
}

/**
 * The allowance a person needs for a type: for the leave year of the policy applying on the later
 * of today and their start, unless one already overlaps it or they are employed on none of its days.
 */
function newAllowance(
  person: Person,
  timeOffTypeId: string,
  today: CalendarDate,
): Pick<Allowance, "timeOffTypeId" | "leaveYearStart" | "leaveYearEnd"> | null {
  const anchor = person.serviceStart && person.serviceStart > today ? person.serviceStart : today;
  const version = person.timelineOf(timeOffTypeId).getVersionOnDate(anchor);
  if (!version?.leaveYear) {
    return null;
  }
  const { start, end } = leaveYearContaining(version.leaveYear, person.serviceStart, anchor);
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

/** The policy versions that apply to the person over the allowance's leave year. */
function datedPolicies(person: Person, allowance: Allowance): DatedPolicy[] {
  return person
    .timelineOf(allowance.timeOffTypeId)
    .getVersions(allowance.leaveYearStart, allowance.leaveYearEnd)
    .map(({ version, startDate, endDate }) => ({
      startDate,
      endDate,
      balance: version.balance,
      bankHolidays: version.bankHolidays,
      rules: version.rules,
    }));
}
