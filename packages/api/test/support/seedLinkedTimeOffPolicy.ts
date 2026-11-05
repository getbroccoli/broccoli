import type { Orm, Transact } from "../../src/core/db";
import { ADMIN } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";
import { seedTimeOffPolicy } from "./seedTimeOff";
import { timeOffService } from "./timeOffService";

/** A company's 20-day policy, linked to the default terms and one full-year member. */
export async function seedLinkedTimeOffPolicy(orm: Orm, seed: TestSeed, transact: Transact) {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const policy = await seedTimeOffPolicy(orm, {
    name: "20 days plus bank holidays", balance: "balance_from_allowance", entitlementDays: 20,
  });
  const service = timeOffService(orm, { today: "2026-11-05" });
  const termsId = await seed.defaultTermsId();
  await transact((tx) => service.linkTermsPolicies(ADMIN, tx, { termsId, timeOffPolicyIds: [policy.id] }));
  return { employee, policy, service, termsId };
}
