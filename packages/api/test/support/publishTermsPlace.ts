import type { Orm, Transact } from "../../src/core/db";
import type { BankHolidayCalendar } from "../../src/modules/bankHolidays";
import type { WeekdayMinutes } from "../../src/modules/employees";
import { workingPatternRepository } from "../../src/modules/employees/db";
import { timeOffPolicyRepository } from "../../src/modules/timeOff/db";
import { allowanceSnapshot } from "./allowanceSnapshot";
import { seedOwnWeek, seedTermsWeek } from "./seedWorkingPattern";
import { seedEmploymentEnd } from "./seedTimeOff";
import { termsService } from "./termsService";
import { OWNER } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";
import { giveTermsPolicies, readTermsPolicies, timeOffPolicyService } from "./timeOffService";
import { workingPatternService } from "./workingPatternService";

export type Week = {
  minutes: WeekdayMinutes;
  bankHolidayCalendar: BankHolidayCalendar;
};
type Rules =
  | {
      balance: "balance_from_allowance";
      entitlementDays: number;
      bankHolidays: "bank_holidays_on_top_of_allowance" | "bank_holidays_included_in_allowance";
    }
  | { balance: "unlimited_balance" | "no_balance" };
export type Drafts = { week?: Week; rules?: Rules };

/** New terms with Annual leave and a week of their own: a member, one person with their own copy of that week, and an outsider on other terms. */
export async function seedTermsWithPeople({
  orm,
  seed,
  transact,
  employment = { startDate: "2025-01-01", endDate: null },
}: {
  orm: Orm;
  seed: TestSeed;
  transact: Transact;
  employment?: { startDate: string; endDate: string | null };
}) {
  const termsId = await seed.terms();
  const { versionId } = await seedTermsWeek(orm, { termsId, startDate: "2000-01-01" });
  const member = await seed.employee({ startDate: employment.startDate });
  const ownWeek = await seed.employee({ startDate: employment.startDate });
  const outsider = await seed.employee({ startDate: employment.startDate });
  if (employment.endDate !== null) {
    for (const person of [member, ownWeek, outsider]) {
      await seedEmploymentEnd(orm, person.id, employment.endDate);
    }
  }
  await seed.moveToTerms(member.id, termsId);
  await seed.moveToTerms(ownWeek.id, termsId);
  await seedOwnWeek(orm, { employeeId: ownWeek.id, versionId, startDate: "2026-01-01" });
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  return {
    termsId,
    memberId: member.id,
    ownWeekId: ownWeek.id,
    outsiderId: outsider.id,
    employeeIds: [member.id, ownWeek.id, outsider.id],
  };
}

export async function saveDrafts(orm: Orm, termsId: string, { week, rules }: Drafts) {
  if (week) await workingPatternService(orm).saveWorkingPattern(OWNER, { termsId, ...week });
  if (rules) {
    const [annualLeave] = await readTermsPolicies(orm, termsId);
    await timeOffPolicyService(orm).saveTimeOffPolicy(OWNER, {
      termsId,
      timeOffTypeId: annualLeave!.timeOffTypeId,
      rules,
    });
  }
}

/** Each person's working weeks from before this leave year until `until`. */
export function readWeeks(orm: Orm, employeeIds: string[], until: string) {
  return workingPatternService(orm).readWorkingWeeks(OWNER, {
    employeeIds,
    from: "2025-01-01",
    until,
  });
}

export async function peopleSnapshot(orm: Orm, employeeIds: string[]) {
  const weeks = await readWeeks(orm, employeeIds, "2028-12-31");
  const allowances = await allowancesOf(orm, employeeIds);
  return new Map(
    employeeIds.map((id, index) => [id, { weeks: weeks.get(id), allowances: allowances[index] }]),
  );
}

/** The terms' and their people's working week and rules assignments. */
export async function readPublishedAssignments(
  orm: Orm,
  { termsId, employeeIds }: { termsId: string; employeeIds: string[] },
) {
  const owners = { termsIds: [termsId], employeeIds };
  return {
    weekAssignments: await workingPatternRepository(orm).findAssignments(owners),
    ruleAssignments: await timeOffPolicyRepository(orm).findAssignments(owners),
  };
}

/** Everything a publish may change for the terms and their people. */
export async function placeSnapshot(
  orm: Orm,
  { termsId, employeeIds }: { termsId: string; employeeIds: string[] },
) {
  return {
    terms: await termsService(orm).readTerms(OWNER, termsId),
    history: await termsService(orm).readTermsHistory(OWNER, termsId, {}),
    ...(await readPublishedAssignments(orm, { termsId, employeeIds })),
    weeks: await readWeeks(orm, employeeIds, "2028-12-31"),
    allowances: await allowancesOf(orm, employeeIds),
  };
}

/** Each person's allowance snapshot, one query at a time on the shared connection. */
async function allowancesOf(orm: Orm, employeeIds: string[]) {
  const snapshots = [];
  for (const id of employeeIds) snapshots.push(await allowanceSnapshot(orm, id));
  return snapshots;
}
