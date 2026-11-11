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

  const draft1 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft1],
    startDate: "2026-01-01",
    owners: [{ termsId }],
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
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [{ versionId: draft1.id, startDate: "2026-01-01", endDate: null }],
  );
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

  const draft2 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft2],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });

  expect(await readAllowances(orm, employee.id)).toEqual(before);
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [
      { startDate: "2026-01-01", endDate: "2026-12-31" },
      { versionId: draft2.id, startDate: "2027-01-01", endDate: null },
    ],
  );
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

  const draft3 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft3],
    startDate: "2026-07-01",
    owners: [{ termsId }],
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
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [
      { startDate: "2026-01-01", endDate: "2026-06-30" },
      { versionId: draft3.id, startDate: "2026-07-01", endDate: null },
    ],
  );
});

test("publishing twice on the same date corrects allowances without editing published versions", async ({
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
  const draft4 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft4],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });
  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 22 }]);

  const draft5 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft5],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 25 }]);
  const published = (await timeOffPolicyRepository(orm).findAll()).find(
    ({ id }) => id === policy!.id,
  )!;
  expect(published.versions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: draft4.id,
        status: "published",
        rules: expect.arrayContaining([
          expect.objectContaining({ entitlementDays: 22 }),
        ]) as unknown,
      }),
      expect.objectContaining({
        id: draft5.id,
        status: "published",
        rules: expect.arrayContaining([
          expect.objectContaining({ entitlementDays: 25 }),
        ]) as unknown,
      }),
    ]),
  );
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [{ versionId: draft5.id, startDate: "2026-01-01", endDate: null }],
  );
});

test("publishing replaces later assignments of the same policy as well as the covering assignment, as one row", async ({
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
  const draft6 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft6],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });

  const draft7 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft7],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [
      { startDate: "2026-01-01", endDate: "2026-06-30" },
      { versionId: draft7.id, startDate: "2026-07-01", endDate: null },
    ],
  );
});
