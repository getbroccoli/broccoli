import { EMPLOYEE, expect, OWNER, readAllowances, test, timeOffService } from "#test/support";

test("linking a group of 700 people gives each of them an allowance", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.employees(700);
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;

  const result = await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );

  expect(result).toEqual({ employeeCount: 700, allowancesCreated: 700, linesAppended: 6300 });
});

test("refuses with NOT_FOUND a group that does not exist", async ({ orm, transact }) => {
  const service = timeOffService(orm);
  const policyGroupId = crypto.randomUUID();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;

  await expect(
    transact((tx) =>
      service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("linking the statutory minimum grants a full-timer 20 days after bank holidays", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;

  const result = await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );

  expect(result).toEqual({ employeeCount: 1, allowancesCreated: 1, linesAppended: 9 });
  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([
    {
      typeKey: "annual_leave",
      leaveYearStart: "2026-01-01",
      leaveYearEnd: "2026-12-31",
      total: 20,
    },
  ]);
  expect(allowances[0]!.lines).toEqual([
    {
      kind: "entitlement_grant",
      amount: 28,
      effectiveDate: "2026-01-01",
      causeKind: "policy_linked_to_group",
      causeRef: policyGroupId,
    },
    ...[
      "2026-01-01",
      "2026-04-03",
      "2026-04-06",
      "2026-05-04",
      "2026-05-25",
      "2026-08-31",
      "2026-12-25",
      "2026-12-28",
    ].map((effectiveDate) => ({
      kind: "bank_holiday_taken",
      amount: -1,
      effectiveDate,
      causeKind: "policy_linked_to_group",
      causeRef: policyGroupId,
    })),
  ]);
});

test("an October starter receives prorated leave and only the remaining bank holidays", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ firstName: "Sam", startDate: "2026-10-12" });
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;

  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([
    {
      typeKey: "annual_leave",
      leaveYearStart: "2026-01-01",
      leaveYearEnd: "2026-12-31",
      total: 4.5,
    },
  ]);
  expect(
    allowances[0]!.lines.map(({ kind, amount, effectiveDate }) => ({
      kind,
      amount,
      effectiveDate,
    })),
  ).toEqual([
    { kind: "entitlement_grant", amount: 6.213699, effectiveDate: "2026-10-12" },
    { kind: "bank_holiday_taken", amount: -1, effectiveDate: "2026-12-25" },
    { kind: "bank_holiday_taken", amount: -1, effectiveDate: "2026-12-28" },
    { kind: "rounding_up_to_half_day", amount: 0.286301, effectiveDate: "2026-10-12" },
  ]);
});

test("linking 25 days plus bank holidays leaves a full-timer 25 days to book", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_25_days_plus_bank_holidays",
  )!;

  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ typeKey: "annual_leave", total: 25 }]);
  expect(allowances[0]!.lines.map(({ kind, amount }) => ({ kind, amount }))).toEqual([
    { kind: "entitlement_grant", amount: 25 },
    { kind: "bank_holiday_allowance_grant", amount: 8 },
    ...Array.from({ length: 8 }, () => ({ kind: "bank_holiday_taken", amount: -1 })),
  ]);
});

test("refuses a second Annual leave policy without changing the group's policies or allowances", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policies = await service.listPolicies(OWNER, orm);
  const statutory = policies.find((p) => p.key === "uk_statutory_minimum")!;
  const twentyDays = policies.find((p) => p.key === "uk_20_days_plus_bank_holidays")!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [statutory.id] }),
  );
  const before = await readAllowances(orm, employee.id);

  await expect(
    transact((tx) =>
      service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [twentyDays.id] }),
    ),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The group already has a policy for Annual leave.",
  });

  expect(await service.readGroupPolicies(OWNER, { policyGroupId })).toEqual([statutory]);
  expect(await readAllowances(orm, employee.id)).toEqual(before);
});

test("refuses an employee linking a policy to a group", async ({ orm, seed, transact }) => {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;

  await expect(
    transact((tx) =>
      service.linkGroupPolicies(EMPLOYEE, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await service.readGroupPolicies(OWNER, { policyGroupId })).toEqual([]);
});

test("linking record-only policies creates no allowances", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policies = await service.listPolicies(OWNER, orm);
  const recordOnly = ["sickness", "family_leave", "other"].map((typeKey) =>
    policies.find((p) => p.typeKey === typeKey)!,
  );
  expect(recordOnly.map((p) => p.balance)).toEqual(["no_balance", "no_balance", "no_balance"]);

  const result = await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, {
      policyGroupId,
      timeOffPolicyIds: recordOnly.map((p) => p.id),
    }),
  );

  expect(result).toEqual({ employeeCount: 1, allowancesCreated: 0, linesAppended: 0 });
  expect(await readAllowances(orm, employee.id)).toEqual([]);
});

test("reads the group's linked policies with their keys", async ({ orm, seed, transact }) => {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policies = await service.listPolicies(OWNER, orm);
  const statutory = policies.find((p) => p.key === "uk_statutory_minimum")!;
  const recordOnly = ["sickness", "family_leave", "other"].map((typeKey) =>
    policies.find((p) => p.typeKey === typeKey)!,
  );
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, {
      policyGroupId,
      timeOffPolicyIds: [statutory.id, ...recordOnly.map((p) => p.id)],
    }),
  );

  const linked = await service.readGroupPolicies(OWNER, { policyGroupId });

  expect(linked).toHaveLength(4);
  expect(linked).toEqual(expect.arrayContaining([statutory, ...recordOnly]));
});
