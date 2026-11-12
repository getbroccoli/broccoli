import type { Orm, Transact } from "../../src/core/db";
import type { TestSeed } from "./testSeed";
import { seedTermsPeriods } from "./seedTerms";
import { seedTermsPolicy } from "./seedTimeOff";
import { seedTermsWeek } from "./seedWorkingPattern";
import { seedAnnualLeaveEmployee } from "./timeOffService";

/** Annual leave is Unlimited until 30 June 2027, then uses the default terms' allowance. */
export async function seedMixedCountsEmployee(orm: Orm, seed: TestSeed, transact: Transact) {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const unlimitedTermsId = await seed.terms("Unlimited leave");
  await seedTermsWeek(orm, { termsId: unlimitedTermsId, startDate: "2025-01-01" });
  await seedTermsPolicy(orm, {
    termsId: unlimitedTermsId,
    timeOffTypeId: person.timeOffTypeId,
    startDate: "2025-01-01",
    version: {
      balance: "unlimited_balance",
      bankHolidays: null,
      leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
      rules: [],
    },
  });
  await seedTermsPeriods(orm, person.employeeId, [
    { termsId: unlimitedTermsId, startDate: null, endDate: "2027-06-30" },
    { termsId: await seed.defaultTermsId(), startDate: "2027-07-01", endDate: null },
  ]);
  return person;
}
