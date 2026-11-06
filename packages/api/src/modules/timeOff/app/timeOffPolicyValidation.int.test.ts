import {
  EMPLOYEE,
  expect,
  OWNER,
  giveTermsPolicies,
  readTermsPolicies,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("policy rules cannot change before the start of this year", async ({
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

  await expect(
    service.changePolicy(OWNER, {
      timeOffPolicyId: policy!.id,
      startDate: "2025-12-31",
      rules: {
        balance: "balance_from_allowance",
        entitlementDays: 22,
        bankHolidays: "bank_holidays_on_top_of_allowance",
      },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "too_early" }],
  });
});

test("how leave counts cannot change partway through a leave year", async ({
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

  await expect(
    service.changePolicy(OWNER, {
      timeOffPolicyId: policy!.id,
      startDate: "2026-07-01",
      rules: { balance: "unlimited_balance" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.balance", code: "not_leave_year_start" }],
  });
});

test("changing January's balance refuses a kept July version that would change it mid-year", async ({
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
    startDate: "2026-07-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  const before = await timeOffPolicyRepository(orm).findAll();

  await expect(
    service.changePolicy(OWNER, {
      timeOffPolicyId: policy!.id,
      startDate: "2026-01-01",
      rules: { balance: "unlimited_balance" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.balance", code: "not_leave_year_start" }],
  });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
});

test("an allowance requires a bank holiday choice", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.changePolicy(OWNER, {
      timeOffPolicyId: policy!.id,
      startDate: "2026-01-01",
      rules: { balance: "balance_from_allowance", entitlementDays: 22 },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.bankHolidays", code: "required" }],
  });
});

test("an allowance requires yearly entitlement days", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.changePolicy(OWNER, {
      timeOffPolicyId: policy!.id,
      startDate: "2026-01-01",
      rules: {
        balance: "balance_from_allowance",
        bankHolidays: "bank_holidays_on_top_of_allowance",
      },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.entitlementDays", code: "out_of_range" }],
  });
});

test.for([367, 20.3, -1])(
  "refuses %s yearly entitlement days",
  async (entitlementDays, { orm, seed, transact }) => {
    const termsId = await seed.defaultTermsId();
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ key: "uk_20_days_plus_bank_holidays" }],
      today: "2026-11-06",
    });
    const [policy] = await readTermsPolicies(orm, termsId);
    const service = timeOffPolicyService(orm, { today: "2026-11-06" });

    await expect(
      service.changePolicy(OWNER, {
        timeOffPolicyId: policy!.id,
        startDate: "2026-01-01",
        rules: {
          balance: "balance_from_allowance",
          entitlementDays,
          bankHolidays: "bank_holidays_on_top_of_allowance",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "rules.entitlementDays", code: "out_of_range" }],
    });
  },
);

test("an employee cannot offer time off rules", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const [type] = await timeOffPolicyRepository(orm).findAllTypes();
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.createPolicy(EMPLOYEE, {
      termsId,
      timeOffTypeId: type!.id,
      startDate: "2027-01-01",
      rules: { balance: "no_balance" },
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([]);
});

test("an employee cannot change time off rules", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const before = await timeOffPolicyRepository(orm).findAll();

  await expect(
    service.changePolicy(EMPLOYEE, {
      timeOffPolicyId: policy!.id,
      startDate: "2027-01-01",
      rules: { balance: "unlimited_balance" },
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
});

test("an employee cannot cancel time off rules", async ({ orm, seed, transact }) => {
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
    rules: { balance: "unlimited_balance" },
  });
  const before = await timeOffPolicyRepository(orm).findAll();

  await expect(
    service.cancelPolicyChange(EMPLOYEE, { timeOffPolicyId: policy!.id, startDate: "2027-01-01" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
});
