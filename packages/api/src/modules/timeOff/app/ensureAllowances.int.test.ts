import {
  employeeServices,
  expect,
  OWNER,
  readAllowances,
  SYSTEM,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";

test("ensuring allowances writes nothing when no policy is linked", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);

  const result = await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employee.id],
      cause: { kind: "DAILY_CHECK", ref: "2026-06-01" },
    }),
  );

  expect(result).toEqual({ allowancesCreated: 0, linesAppended: 0 });
  expect(await readAllowances(orm, employee.id)).toEqual([]);
});

test("ensuring allowances grants leave to a person added after the policy was linked", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const employee = await seed.employee({ startDate: "2025-01-01" });

  const result = await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employee.id],
      cause: { kind: "EMPLOYEE_ADDED", ref: null },
    }),
  );

  expect(result).toEqual({ allowancesCreated: 1, linesAppended: 9 });
  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([
    {
      typeKey: "annual_leave",
      leaveYearStart: "2026-01-01",
      leaveYearEnd: "2026-12-31",
      total: 20,
    },
  ]);
  expect(allowances[0]!.lines.map(({ causeKind, causeRef }) => ({ causeKind, causeRef }))).toEqual(
    Array.from({ length: 9 }, () => ({ causeKind: "employee_added", causeRef: null })),
  );
});

test("a start date change corrects the allowance by appending lines", async ({
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
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const [before] = await readAllowances(orm, employee.id);
  expect(before!.total).toBe(20);

  await employeeServices(orm).updateEmployee(OWNER, { id: employee.id, startDate: "2026-07-01" });
  await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employee.id],
      cause: { kind: "START_DATE_CHANGED", ref: "2026-07-01" },
    }),
  );

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ total: 11.5 }]);
  expect(allowances[0]!.lines.slice(0, before!.lines.length)).toEqual(before!.lines);
  const appended = allowances[0]!.lines.slice(before!.lines.length);
  expect(appended.length).toBeGreaterThan(0);
  expect(
    appended.every(
      (line) => line.causeKind === "start_date_changed" && line.causeRef === "2026-07-01",
    ),
  ).toBe(true);
});

test("a September switch to Tuesday through Thursday cuts the grant and restores the December bank holidays", async ({
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
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const [before] = await readAllowances(orm, employee.id);
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
    fullDayMinutes: 450,
  });

  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    effectiveFrom: "2026-09-01",
  });
  await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employee.id],
      cause: { kind: "WORKING_PATTERN_CHANGED", ref: "2026-09-01" },
    }),
  );

  const [after] = await readAllowances(orm, employee.id);
  expect(after!.lines.slice(0, before!.lines.length)).toEqual(before!.lines);
  const appended = after!.lines.slice(before!.lines.length);
  expect(
    appended.map(({ kind, rule, effectiveDate, amount }) => [
      kind,
      kind === "bank_holiday_taken" ? effectiveDate : rule,
      amount,
    ]),
  ).toEqual([
    ["entitlement_grant", "yearly_entitlement", -3.743562],
    ["bank_holiday_taken", "2026-12-25", 1],
    ["bank_holiday_taken", "2026-12-28", 1],
    ["rounding_up_to_half_day", null, 0.243562],
  ]);
  expect(before!.total).toEqual(20);
  expect(after!.total).toEqual(18.5);
  expect(appended.every(({ causeKind }) => causeKind === "working_pattern_changed")).toEqual(true);
  expect(
    appended
      .filter(({ kind }) => kind !== "bank_holiday_taken")
      .map(({ effectiveDate }) => effectiveDate),
  ).toEqual(["2026-09-01", "2026-09-01"]);
});

test("a Scottish working pattern charges Scotland's ten weekday bank holidays", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Scotland",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
    bankHolidayCalendar: "scotland",
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    effectiveFrom: "2026-01-01",
  });
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;

  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ total: 18 }]);
  expect(
    allowances[0]!.lines
      .filter((line) => line.kind === "bank_holiday_taken")
      .map(({ effectiveDate, amount }) => ({ effectiveDate, amount })),
  ).toEqual(
    [
      "2026-01-01",
      "2026-01-02",
      "2026-04-03",
      "2026-05-04",
      "2026-05-25",
      "2026-06-15",
      "2026-08-03",
      "2026-11-30",
      "2026-12-25",
      "2026-12-28",
    ].map((effectiveDate) => ({ effectiveDate, amount: -1 })),
  );
});

test("ensuring the same allowance twice appends nothing the second time", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employee.id],
      cause: { kind: "EMPLOYEE_ADDED", ref: null },
    }),
  );
  const before = await readAllowances(orm, employee.id);

  const result = await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employee.id],
      cause: { kind: "EMPLOYEE_ADDED", ref: null },
    }),
  );

  expect(result).toEqual({ allowancesCreated: 0, linesAppended: 0 });
  expect(await readAllowances(orm, employee.id)).toEqual(before);
});

test("concurrent runs create one allowance and append its lines only once", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const employee = await seed.employee({ startDate: "2025-01-01" });

  const results = await Promise.all([
    transact((tx) =>
      service.ensureAllowances(SYSTEM, tx, {
        employeeIds: [employee.id],
        cause: { kind: "EMPLOYEE_ADDED", ref: null },
      }),
    ),
    transact((tx) =>
      service.ensureAllowances(SYSTEM, tx, {
        employeeIds: [employee.id],
        cause: { kind: "EMPLOYEE_ADDED", ref: null },
      }),
    ),
  ]);

  expect(results).toEqual(
    expect.arrayContaining([
      { allowancesCreated: 1, linesAppended: 9 },
      { allowancesCreated: 0, linesAppended: 0 },
    ]),
  );
  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ typeKey: "annual_leave", total: 20 }]);
  expect(allowances[0]!.lines.map(({ kind, amount }) => ({ kind, amount }))).toEqual([
    { kind: "entitlement_grant", amount: 28 },
    ...Array.from({ length: 8 }, () => ({ kind: "bank_holiday_taken", amount: -1 })),
  ]);
});

test("a future starter gets an allowance for the leave year they join", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const employee = await seed.employee({ startDate: "2027-02-01" });

  await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employee.id],
      cause: { kind: "EMPLOYEE_ADDED", ref: null },
    }),
  );

  expect(await readAllowances(orm, employee.id)).toMatchObject([
    { typeKey: "annual_leave", leaveYearStart: "2027-01-01", leaveYearEnd: "2027-12-31" },
  ]);
});
