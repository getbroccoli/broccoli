import {
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  seedTimeOffType,
  seedTimeOffAssignment,
  test,
  timeOffPolicyService,
  workingPatternService,
  termsService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";
import { STANDARD_LEAVE_POLICIES } from "../domain";

test("an offer assigns its published rules from the chosen date and grants an allowance", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 5,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [{ versionId: draft.id, owner: { termsId }, startDate: "2026-01-01", endDate: null }],
  );
  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ total: 5 }]);
  expect(allowances[0]!.lines).toContainEqual(
    expect.objectContaining({
      causeKind: "time_off_rules_changed",
      causeRef: `${draft.timeOffPolicyId}:2026-01-01`,
    }),
  );
});

test("an offer may choose how leave counts away from the leave year start", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "unlimited_balance" },
  });

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [{ versionId: draft.id, startDate: "2026-07-01", endDate: null }],
  );
});

test("an unticked owner keeps its old rules and allowance", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffPolicyId: policy!.id,
    timeOffTypeId: policy!.timeOffTypeId,
    versionId: policy!.versionId,
  });
  const repository = timeOffPolicyRepository(orm);
  const assignments = await repository.findAssignments({ employeeIds: [employee.id] });
  const before = await readAllowances(orm, employee.id);
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 30,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  expect(await repository.findAssignments({ employeeIds: [employee.id] })).toEqual(assignments);
  expect(await readAllowances(orm, employee.id)).toEqual(before);
});

test("publishing with no owners changes no assignments or allowances", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const repository = timeOffPolicyRepository(orm);
  const before = await readAllowances(orm, employee.id);
  const assignments = await repository.findAssignments({ termsIds: [termsId] });
  const history = await termsService(orm).readTermsHistory(OWNER, termsId, {});
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: { balance: "unlimited_balance" },
  });

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [],
  });

  expect((await repository.findAll())[0]!.versions).toContainEqual(
    expect.objectContaining({ id: draft.id, status: "published", termsId: null }),
  );
  expect(await repository.findAssignments({ termsIds: [termsId] })).toEqual(assignments);
  expect(await readAllowances(orm, employee.id)).toEqual(before);
  expect(await termsService(orm).readTermsHistory(OWNER, termsId, {})).toEqual(history);
});

test("a working-week-only publish recalculates every type's allowance", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const study = await seedTimeOffType(orm, "Study leave");
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [
      { key: "uk_20_days_plus_bank_holidays" },
      { timeOffTypeId: study.id, version: STANDARD_LEAVE_POLICIES.uk_25_days_plus_bank_holidays },
    ],
  });
  const before = await readAllowances(orm, employee.id);
  expect(before.map(({ total }) => total).sort((a, b) => a - b)).toEqual([20, 25]);
  const draft = await workingPatternService(orm).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [450, 450, 450, 450, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });

  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  const after = await readAllowances(orm, employee.id);
  expect(after.map(({ total }) => total).sort((a, b) => a - b)).toEqual([16.5, 20.5]);
  for (const allowance of after) {
    expect(allowance.lines).toContainEqual(
      expect.objectContaining({ causeKind: "working_pattern_changed" }),
    );
  }
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
  const [otherAssignment] = await timeOffPolicyRepository(orm).findAssignments({
    termsIds: [otherTermsId],
  });
  const otherPolicy = (await timeOffPolicyRepository(orm).findAll()).find(
    ({ id }) => id === otherAssignment!.timeOffPolicyId,
  )!;
  const before = await readAllowances(orm, otherEmployee.id);

  const draft8 = await service.saveTimeOffPolicy(OWNER, {
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
    versions: [draft8],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 22 }]);
  expect(await readAllowances(orm, otherEmployee.id)).toEqual(before);
  expect(await timeOffPolicyRepository(orm).findAll()).toContainEqual(otherPolicy);
});
