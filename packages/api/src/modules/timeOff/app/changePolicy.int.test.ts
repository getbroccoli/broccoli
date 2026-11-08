import {
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("changing Annual leave from this year's start corrects the allowance and records its cause", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 20 }]);

  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ leaveYearStart: "2026-01-01", total: 22 }]);
  expect(allowances[0]!.lines).toContainEqual(
    expect.objectContaining({
      causeKind: "time_off_rules_changed",
      causeRef: `${policy!.id}:2026-01-01`,
      effectiveDate: "2026-01-01",
    }),
  );
  expect(await timeOffPolicyRepository(orm).findAll()).toMatchObject([
    {
      versions: [
        { startDate: null, endDate: "2025-12-31" },
        {
          startDate: "2026-01-01",
          endDate: null,
          rules: [{ kind: "yearly_entitlement", entitlementDays: 22 }],
        },
      ],
    },
  ]);
});

test("planning next year's rules leaves this year's allowance untouched", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const before = await readAllowances(orm, employee.id);

  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  expect(await readAllowances(orm, employee.id)).toEqual(before);
  expect(await timeOffPolicyRepository(orm).findAll()).toMatchObject([
    {
      versions: [
        { startDate: null, endDate: "2026-12-31", rules: [{ entitlementDays: 20 }] },
        { startDate: "2027-01-01", endDate: null, rules: [{ entitlementDays: 22 }] },
      ],
    },
  ]);
});

test("changing rules in July splits this year's allowance at that date", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-07-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  const [allowance] = await readAllowances(orm, employee.id);
  // 181 days at 20 and 184 at 22 gives 21.008219 days, rounded up to a half day.
  expect(allowance!.total).toBe(21.5);
  expect(allowance!.lines).toContainEqual(
    expect.objectContaining({
      causeKind: "time_off_rules_changed",
      causeRef: `${policy!.id}:2026-07-01`,
      effectiveDate: "2026-07-01",
    }),
  );
  expect(await timeOffPolicyRepository(orm).findAll()).toMatchObject([
    {
      versions: [
        { startDate: null, endDate: "2026-06-30" },
        { startDate: "2026-07-01", endDate: null, rules: [{ entitlementDays: 22 }] },
      ],
    },
  ]);
});

test("saving twice on the same date replaces rules already used to grant allowances", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 22 }]);

  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 25 }]);
  expect(await timeOffPolicyRepository(orm).findAll()).toMatchObject([
    {
      versions: [
        { startDate: null, endDate: "2025-12-31" },
        { startDate: "2026-01-01", endDate: null, rules: [{ entitlementDays: 25 }] },
      ],
    },
  ]);
});

test("changing rules before a later plan keeps that plan and splits only the covering version", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-07-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  expect(await timeOffPolicyRepository(orm).findAll()).toMatchObject([
    {
      versions: [
        { startDate: null, endDate: "2026-06-30", rules: [{ entitlementDays: 20 }] },
        { startDate: "2026-07-01", endDate: "2026-12-31", rules: [{ entitlementDays: 22 }] },
        { startDate: "2027-01-01", endDate: null, rules: [{ entitlementDays: 25 }] },
      ],
    },
  ]);
});

test("changing one terms' rules leaves the other terms' policy and allowance untouched", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const otherTermsId = await seed.terms("Scotland");
  const otherEmployee = await seed.employee({ startDate: "2025-01-01" });
  await seed.moveToTerms(otherEmployee.id, otherTermsId);
  await giveTermsPolicies(orm, transact, {
    termsId: otherTermsId,
    policies: [{ key: "uk_25_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const otherPolicy = (await timeOffPolicyRepository(orm).findAll()).find(
    ({ termsId }) => termsId === otherTermsId,
  )!;
  const before = await readAllowances(orm, otherEmployee.id);

  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 22 }]);
  expect(await readAllowances(orm, otherEmployee.id)).toEqual(before);
  expect(await timeOffPolicyRepository(orm).findAll()).toContainEqual(otherPolicy);
});
