import type { Tx } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS, type BankHolidayService } from "../../bankHolidays";
import type { EmployeeReadService, EmployeeWorkingPatternService } from "../../employees";
import { type Allowance, allowanceRepository, timeOffPolicyRepository } from "../db";
import {
  type AllowanceCause,
  allowanceTargetOf,
  type DatedPolicy,
  leaveYearContaining,
  ledgerDifference,
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
  employeeReads: Pick<EmployeeReadService, "readEmploymentPeriods" | "readPolicyGroupMemberships">;
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
  { employeeReads, workingWeeks, bankHolidays, today }: AllowanceEngineDependencies,
  tx: Tx,
  { employeeIds, cause }: { employeeIds: readonly string[]; cause: AllowanceCause },
): Promise<EnsuredAllowances> {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) {
    return { allowancesCreated: 0, linesAppended: 0 };
  }
  const allowances = allowanceRepository(tx);
  const policyRepository = timeOffPolicyRepository(tx);
  // One after another: they share the transaction's connection.
  await allowances.lockEmployees(ids);
  const policies = await policyRepository.findAll();
  const employments = await employeeReads.readEmploymentPeriods(tx, ids);
  const memberships = await employeeReads.readPolicyGroupMemberships(tx, ids);
  const groupIds = [...memberships.values()].flat().map(({ policyGroupId }) => policyGroupId);
  const groupLinks = await policyRepository.findGroupLinks([...new Set(groupIds)]);
  const assignments = await policyRepository.findAssignments(ids);
  const existing = await allowances.findByEmployees(ids);
  const date = today();
  const people = new Map(
    ids.map((id) => {
      const periods = employments.get(id) ?? [];
      const timeline: PolicyTimeline = {
        assignments: assignments.get(id) ?? [],
        memberships: memberships.get(id) ?? [],
        groupLinks,
      };
      return [id, { periods, serviceStart: periods[0]?.startDate ?? null, timeline }];
    }),
  );
  const typeIds = [...new Set(policies.map(({ timeOffType }) => timeOffType.id))];
  const created = await allowances.insert(
    ids.flatMap((id) =>
      typeIds.flatMap((typeId) => {
        const own = existing.filter(({ employeeId }) => employeeId === id);
        const allowance = newAllowance(people.get(id)!, policies, own, typeId, date);
        return allowance ? [{ employeeId: id, ...allowance }] : [];
      }),
    ),
  );
  const open = [...existing.filter(({ leaveYearEnd }) => leaveYearEnd >= date), ...created];
  if (open.length === 0) {
    return { allowancesCreated: created.length, linesAppended: 0 };
  }
  const from = open.map(({ leaveYearStart }) => leaveYearStart).toSorted()[0]!;
  const until = open
    .map(({ leaveYearEnd }) => leaveYearEnd)
    .toSorted()
    .at(-1)!;
  const weeks = await workingWeeks.readWorkingWeeksInTransaction(tx, {
    employeeIds: [...new Set(open.map(({ employeeId }) => employeeId))],
    from,
    until,
  });
  const holidays = await bankHolidays.readBankHolidays(PrincipalSecurityContext.system(), {
    calendars: BANK_HOLIDAY_CALENDARS,
    from,
    until,
  });
  const holidayDates = new Map(
    [...holidays].map(([calendar, days]) => [calendar, days.map(({ date: day }) => day)]),
  );
  const sums = await allowances.findEngineSums(open.map(({ id }) => id));
  const lines = open.flatMap((allowance) => {
    const person = people.get(allowance.employeeId)!;
    const target = allowanceTargetOf({
      leaveYear: { start: allowance.leaveYearStart, end: allowance.leaveYearEnd },
      employments: person.periods,
      serviceStart: person.serviceStart,
      policies: datedPolicies(person.timeline, policies, allowance),
      workingWeeks: weeks.get(allowance.employeeId)!,
      bankHolidays: holidayDates,
    });
    return ledgerDifference(allowance, target, sums.get(allowance.id) ?? [], cause);
  });
  return { allowancesCreated: created.length, linesAppended: await allowances.insertLines(lines) };
}

interface Person {
  periods: readonly { startDate: CalendarDate | null; endDate: CalendarDate | null }[];
  serviceStart: CalendarDate | null;
  timeline: PolicyTimeline;
}

/**
 * The allowance a person needs for a type: for the leave year of the policy applying on the later
 * of today and their start, unless one already overlaps it or they are employed on none of its days.
 */
function newAllowance(
  person: Person,
  policies: readonly TimeOffPolicy[],
  own: readonly Allowance[],
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
  const overlaps = own.some(
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
