import {
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  test,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";
import { ApplicationError } from "../../../core/applicationError";
import { timeOffPolicyRepository } from "../db";

test("cancelling a planned stop makes the last version open-ended again", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2027-01-01",
  });

  const result = await service.cancelPolicyChange(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
  });

  expect(result).toMatchObject({
    id: policy!.id,
    versions: [{ startDate: null, endDate: null, balance: "no_balance" }],
  });
  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([result]);
});

test("cancelling a planned policy change extends the earlier version to the cancelled version's end", async ({
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
    startDate: "2026-12-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  const result = await service.cancelPolicyChange(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-12-01",
  });

  expect(result).toMatchObject({
    id: policy!.id,
    versions: [
      { startDate: null, endDate: "2026-12-31", rules: [{ entitlementDays: 20 }] },
      { startDate: "2027-01-01", endDate: null, rules: [{ entitlementDays: 25 }] },
    ],
  });
  expect(await timeOffPolicyRepository(orm).findAll()).toContainEqual(result);
});

test("cancelling January's change refuses a kept July version that would change how leave counts mid-year", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 10,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-07-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 12,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  const before = await timeOffPolicyRepository(orm).findAll();

  const cancellation = service.cancelPolicyChange(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
  });

  await expect(cancellation).rejects.toBeInstanceOf(ApplicationError);
  await expect(cancellation).rejects.toMatchObject({
    code: "CONFLICT",
    message:
      "Cancelling this change would change how the type counts partway through a leave year.",
  });
  expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
});

test("cancelling a planned offer removes its policy and leaves the type not offered", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const [type] = await timeOffPolicyRepository(orm).findAllTypes();
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const policy = await service.createPolicy(OWNER, {
    termsId,
    timeOffTypeId: type!.id,
    startDate: "2027-01-01",
    rules: { balance: "no_balance" },
  });

  const result = await service.cancelPolicyChange(OWNER, {
    timeOffPolicyId: policy.id,
    startDate: "2027-01-01",
  });

  expect(result).toBeNull();
  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([]);
  const timeOff = await timeOffService(orm, { today: "2026-11-06" }).readTermsTimeOff(OWNER, [
    termsId,
  ]);
  expect(
    timeOff.get(termsId)!.find(({ timeOffType }) => timeOffType.id === type!.id)!.versions,
  ).toEqual([]);
});

test("cancelling December's rules restores an allowance already granted from them", async ({
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
    startDate: "2026-12-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 32,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 21.5 }]);

  await service.cancelPolicyChange(OWNER, { timeOffPolicyId: policy!.id, startDate: "2026-12-01" });

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ total: 20 }]);
  expect(allowances[0]!.lines.at(-1)).toMatchObject({
    causeKind: "time_off_rules_changed",
    causeRef: `${policy!.id}:2026-12-01`,
  });
});

test.for(["2026-11-05", "2026-11-06"])(
  "a policy change that started on %s cannot be cancelled",
  async (startDate, { orm, seed, transact }) => {
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
      startDate,
      rules: {
        balance: "balance_from_allowance",
        entitlementDays: 22,
        bankHolidays: "bank_holidays_on_top_of_allowance",
      },
    });
    const before = await timeOffPolicyRepository(orm).findAll();

    await expect(
      service.cancelPolicyChange(OWNER, { timeOffPolicyId: policy!.id, startDate }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "This change has already started." });

    expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
  },
);

test("cancelling a date without a policy version refuses it and preserves the policy", async ({
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
  const before = await timeOffPolicyRepository(orm).findAll();

  await expect(
    service.cancelPolicyChange(OWNER, { timeOffPolicyId: policy!.id, startDate: "2026-12-01" }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "This change has already started." });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
});
