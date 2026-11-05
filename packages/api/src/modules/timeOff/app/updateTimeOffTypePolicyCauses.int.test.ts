import { eq } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  expect,
  seedLinkedTimeOffPolicy,
  seedTimeOffPolicy,
  test,
} from "#test/support";

import { allowanceLedgerLines, termsTimeOffPolicies, timeOffAllowanceRules } from "../db";

test("each policy's corrections name that policy when two change at once", async ({
  orm,
  seed,
  transact,
}) => {
  const {
    service,
    policy: first,
    employee,
    termsId,
  } = await seedLinkedTimeOffPolicy(orm, seed, transact);
  const second = await seedTimeOffPolicy(orm, {
    name: "25 days",
    timeOffTypeId: first.timeOffTypeId,
    balance: "balance_from_allowance",
    entitlementDays: 25,
  });
  await orm
    .update(termsTimeOffPolicies)
    .set({ effectiveUntil: calendarDate("2026-06-30") })
    .where(eq(termsTimeOffPolicies.timeOffPolicyId, first.id));
  await orm.insert(termsTimeOffPolicies).values({
    termsId,
    timeOffTypeId: first.timeOffTypeId,
    timeOffPolicyId: second.id,
    effectiveFrom: calendarDate("2026-07-01"),
  });
  await transact((tx) =>
    service.ensureAllowances(ADMIN, tx, {
      employeeIds: [employee.id],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );

  await service.updateTimeOffType(ADMIN, {
    id: first.timeOffTypeId,
    policies: [
      { id: first.id, allowanceDays: 22 },
      { id: second.id, allowanceDays: 27 },
    ],
  });

  const rules = await orm.select().from(timeOffAllowanceRules);
  const policyOfRule = new Map(rules.map(({ id, timeOffPolicyId }) => [id, timeOffPolicyId]));
  const grants = (
    await orm
      .select()
      .from(allowanceLedgerLines)
      .where(eq(allowanceLedgerLines.causeKind, "policy_changed"))
  ).filter(({ allowanceRuleId }) => allowanceRuleId !== null);
  expect(grants.length).toBeGreaterThan(0);
  expect(
    grants.every(
      ({ allowanceRuleId, causeRef }) => policyOfRule.get(allowanceRuleId!) === causeRef,
    ),
  ).toBe(true);
});
