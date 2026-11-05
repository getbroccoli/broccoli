import { asc, eq } from "drizzle-orm";

import {
  ADMIN,
  allowanceSnapshot,
  calendarDate,
  expect,
  readAllowances,
  seedEmploymentEnd,
  seedLinkedTimeOffPolicy,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";

import { allowanceLedgerLines, termsTimeOffPolicies, timeOffAllowanceRules } from "../db";

test("raising 20 to 22 days moves this year's allowances of everyone on the policy", async ({
  orm,
  seed,
  transact,
}) => {
  const {
    service,
    policy,
    employee: fullTimer,
  } = await seedLinkedTimeOffPolicy(orm, seed, transact);
  const partTimer = await seed.employee({ startDate: "2025-01-01" });
  const joiner = await seed.employee({ startDate: "2026-10-12" });
  const secondTerms = await seed.terms("Three-day week");
  await seed.moveToTerms(partTimer.id, secondTerms);
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(ADMIN, {
    name: "Monday to Wednesday",
    minutes: [450, 450, 450, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setTermsPattern(ADMIN, {
    termsId: secondTerms,
    workingPatternId: pattern.id,
    effectiveFrom: "2025-01-01",
  });
  await transact((tx) =>
    service.linkTermsPolicies(ADMIN, tx, { termsId: secondTerms, timeOffPolicyIds: [policy.id] }),
  );
  const standard = (await patterns.listPatterns(ADMIN)).find(({ isStandard }) => isStandard)!;
  await patterns.assignPattern(ADMIN, {
    employeeId: joiner.id,
    workingPatternId: standard.id,
    effectiveFrom: "2025-01-01",
  });
  await seed.leaveTerms(joiner.id);
  await seedTimeOffAssignment(orm, {
    employeeId: joiner.id,
    timeOffTypeId: policy.timeOffTypeId,
    timeOffPolicyId: policy.id,
  });
  const employeeIds = [fullTimer.id, partTimer.id, joiner.id];
  await transact((tx) =>
    service.ensureAllowances(ADMIN, tx, { employeeIds, cause: { kind: "DAILY_CHECK", ref: null } }),
  );
  const before = await orm
    .select()
    .from(allowanceLedgerLines)
    .orderBy(asc(allowanceLedgerLines.id));
  const rulesBefore = await orm
    .select()
    .from(timeOffAllowanceRules)
    .where(eq(timeOffAllowanceRules.timeOffPolicyId, policy.id));

  const result = await service.saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [
      { id: policy.id, allowanceDays: 22, bankHolidays: "bank_holidays_on_top_of_allowance" },
    ],
  });

  expect(result.allowancesUpdated).toBe(3);
  const figures = await service.readTimeOffTypes(ADMIN, { employeeIds });
  expect(figures.get(fullTimer.id)).toMatchObject([
    { entitlement: 30, bankHolidays: 8, remaining: 22 },
  ]);
  expect(figures.get(partTimer.id)).toMatchObject([
    { entitlement: 18, bankHolidays: 5, remaining: 13 },
  ]);
  expect(figures.get(joiner.id)).toMatchObject([{ entitlement: 7, bankHolidays: 2, remaining: 5 }]);
  const after = await orm.select().from(allowanceLedgerLines).orderBy(asc(allowanceLedgerLines.id));
  expect(after.slice(0, before.length)).toEqual(before);
  const appended = after.slice(before.length);
  expect(appended.length).toBeGreaterThan(0);
  expect(
    appended.every(
      ({ causeKind, causeRef }) => causeKind === "policy_changed" && causeRef === policy.id,
    ),
  ).toBe(true);
  const rules = await orm
    .select()
    .from(timeOffAllowanceRules)
    .where(eq(timeOffAllowanceRules.timeOffPolicyId, policy.id));
  expect(rules.find(({ id }) => id === rulesBefore[0]!.id)!.removedAt).not.toBeNull();
  expect(rules.filter(({ removedAt }) => removedAt === null)).toMatchObject([
    { entitlementDays: "22", entitlementDaysPerWeek: 5 },
  ]);
});

test("a closed leave year keeps its lines", async ({ orm, seed, transact }) => {
  const { policy, service, employee } = await seedLinkedTimeOffPolicy(orm, seed, transact);
  await transact((tx) =>
    timeOffService(orm, { today: "2025-11-05" }).ensureAllowances(ADMIN, tx, {
      employeeIds: [employee.id],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );
  const before = (await allowanceSnapshot(orm, employee.id)).find(
    ({ allowance }) => allowance.leaveYearStart === "2025-01-01",
  )!;
  expect(before.lines.length).toBeGreaterThan(0);

  await service.saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [{ id: policy.id, allowanceDays: 22 }],
  });

  expect(
    (await allowanceSnapshot(orm, employee.id)).find(
      ({ allowance }) => allowance.id === before.allowance.id,
    ),
  ).toEqual(before);
});

test("someone who left before this leave year gets no new lines", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await seedEmploymentEnd(orm, employee.id, "2025-12-31");
  const policy = await seedTimeOffPolicy(orm, {
    name: "Wellbeing",
    balance: "balance_from_allowance",
    entitlementDays: 20,
  });
  const termsId = await seed.defaultTermsId();
  await transact((tx) =>
    timeOffService(orm, { today: "2025-11-05" }).linkTermsPolicies(ADMIN, tx, {
      termsId,
      timeOffPolicyIds: [policy.id],
    }),
  );
  const before = await allowanceSnapshot(orm, employee.id);

  const result = await timeOffService(orm, { today: "2026-11-05" }).saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [{ id: policy.id, allowanceDays: 22 }],
  });

  expect(result.allowancesUpdated).toBe(0);
  expect(await allowanceSnapshot(orm, employee.id)).toEqual(before);
});

test("members of a terms link that ended this year are recalculated for their part", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy, employee } = await seedLinkedTimeOffPolicy(orm, seed, transact);
  await orm
    .update(termsTimeOffPolicies)
    .set({ effectiveUntil: calendarDate("2026-06-30") })
    .where(eq(termsTimeOffPolicies.timeOffPolicyId, policy.id));
  await transact((tx) =>
    service.ensureAllowances(ADMIN, tx, {
      employeeIds: [employee.id],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );

  const result = await service.saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [{ id: policy.id, allowanceDays: 22 }],
  });

  expect(result.allowancesUpdated).toBe(1);
  expect(await readAllowances(orm, employee.id)).toMatchObject([
    { leaveYearStart: "2026-01-01", leaveYearEnd: "2026-12-31", total: 10 },
  ]);
});

test("someone starting next year receives the changed allowance in their first leave year", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2027-01-01" });
  const policy = await seedTimeOffPolicy(orm, {
    name: "Wellbeing",
    balance: "balance_from_allowance",
    entitlementDays: 20,
  });
  const service = timeOffService(orm, { today: "2026-11-05" });
  const termsId = await seed.defaultTermsId();
  await transact((tx) =>
    service.linkTermsPolicies(ADMIN, tx, { termsId, timeOffPolicyIds: [policy.id] }),
  );

  const result = await service.saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [{ id: policy.id, allowanceDays: 22 }],
  });

  expect(result.allowancesUpdated).toBe(1);
  expect(await readAllowances(orm, employee.id)).toMatchObject([
    { leaveYearStart: "2027-01-01", leaveYearEnd: "2027-12-31", total: 22 },
  ]);
});

test("two saves of the same policy in a row append each difference once", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy, employee } = await seedLinkedTimeOffPolicy(orm, seed, transact);
  await service.saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [{ id: policy.id, allowanceDays: 22 }],
  });
  const [before] = await allowanceSnapshot(orm, employee.id);

  const result = await service.saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [{ id: policy.id, allowanceDays: 23 }],
  });

  expect(result.allowancesUpdated).toBe(1);
  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 23 }]);
  const [after] = await allowanceSnapshot(orm, employee.id);
  expect(after!.lines.slice(0, before!.lines.length)).toEqual(before!.lines);
  expect(
    after!.lines
      .slice(before!.lines.length)
      .map(({ amount }) => Number(amount))
      .sort((a, b) => a - b),
  ).toEqual([-22, 23]);
  expect(new Set(after!.lines.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(
    after!.lines.length,
  );
});

test("two admins saving the same type keep both changes without duplicate allowance lines", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy, employee } = await seedLinkedTimeOffPolicy(orm, seed, transact);
  const before = await orm.select().from(allowanceLedgerLines);

  await Promise.all([
    service.saveTimeOffType(ADMIN, {
      id: policy.timeOffTypeId,
      policies: [{ id: policy.id, allowanceDays: 22 }],
    }),
    service.saveTimeOffType(ADMIN, { id: policy.timeOffTypeId, name: "Company leave" }),
  ]);

  const saved = await service.readTimeOffTypeSettings(ADMIN, { id: policy.timeOffTypeId });
  expect(saved).toMatchObject({
    timeOffType: { name: "Company leave" },
    policies: [{ id: policy.id, allowance: { days: 22 } }],
  });
  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 22 }]);
  const after = await orm.select().from(allowanceLedgerLines);
  expect(after).toHaveLength(before.length + 2);
  expect(new Set(after.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(after.length);
});
