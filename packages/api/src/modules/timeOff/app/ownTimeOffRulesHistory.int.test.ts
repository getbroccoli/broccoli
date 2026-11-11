import {
  employeeServices,
  expect,
  giveTermsPolicies,
  OWNER,
  readTermsPolicies,
  test,
  timeOffPolicyService,
} from "#test/support";

test("records giving own rules as one employee history line", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };

  await service.setOwnRules(OWNER, { ...input, startDate: "2027-01-01", rules: twentyFiveDays });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(1);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      {
        field: `timeOff.${annual!.timeOffTypeId}`,
        oldLabel: "Annual leave",
        newLabel: "Annual leave",
      },
    ],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ startDate: "2027-01-01", rules: null });
  expect(JSON.parse(change.newValue!)).toEqual({ startDate: "2027-01-01", rules: twentyFiveDays });
});

test("records the previous and new own rules in one employee history line", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2026-01-01",
    rules: { ...twentyFiveDays, entitlementDays: 22 },
  });

  await service.setOwnRules(OWNER, { ...input, startDate: "2027-01-01", rules: twentyFiveDays });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(2);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      {
        field: `timeOff.${annual!.timeOffTypeId}`,
        oldLabel: "Annual leave",
        newLabel: "Annual leave",
      },
    ],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({
    startDate: "2027-01-01",
    rules: { ...twentyFiveDays, entitlementDays: 22 },
  });
  expect(JSON.parse(change.newValue!)).toEqual({ startDate: "2027-01-01", rules: twentyFiveDays });
});

test("records returning to the terms' rules in one employee history line", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-01-01", rules: twentyFiveDays });

  await service.useTermsRules(OWNER, { ...input, startDate: "2027-01-01" });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(2);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      {
        field: `timeOff.${annual!.timeOffTypeId}`,
        oldLabel: "Annual leave",
        newLabel: "Annual leave",
      },
    ],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ startDate: "2027-01-01", rules: twentyFiveDays });
  expect(JSON.parse(change.newValue!)).toEqual({ startDate: "2027-01-01", rules: null });
});

test("records cancelling own rules with the cancelled rules and no new value", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
  await service.setOwnRules(OWNER, { ...input, startDate: "2027-01-01", rules: twentyFiveDays });

  await service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2027-01-01" });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(2);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      {
        field: `timeOff.${annual!.timeOffTypeId}`,
        oldLabel: "Annual leave",
        newLabel: "Annual leave",
      },
    ],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ startDate: "2027-01-01", rules: twentyFiveDays });
  expect(change.newValue).toBeNull();
});

test("records cancelling a return with the cancelled date and no new value", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-01-01", rules: twentyFiveDays });
  await service.useTermsRules(OWNER, { ...input, startDate: "2027-01-01" });

  await service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2027-01-01" });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(3);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      {
        field: `timeOff.${annual!.timeOffTypeId}`,
        oldLabel: "Annual leave",
        newLabel: "Annual leave",
      },
    ],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ startDate: "2027-01-01", rules: null });
  expect(change.newValue).toBeNull();
});

const twentyFiveDays = {
  balance: "balance_from_allowance" as const,
  entitlementDays: 25,
  bankHolidays: "bank_holidays_on_top_of_allowance" as const,
};
