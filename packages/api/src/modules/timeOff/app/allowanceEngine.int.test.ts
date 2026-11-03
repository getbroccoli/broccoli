import {
  type AllowanceLine,
  employeeServices,
  linkStatutoryMinimumToEnglandAndWales,
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
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
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
  expect(rowsOf(allowances[0]!.lines)).toEqual([
    ["entitlement_grant", "yearly_entitlement", 28, "2026-01-01", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-01-01", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-04-03", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-04-06", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-05-04", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-05-25", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-08-31", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-12-25", "employee_added"],
    ["bank_holiday_taken", null, -1, "2026-12-28", "employee_added"],
  ]);
});

test("a start date change corrects the allowance by appending lines", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
  const [before] = await readAllowances(orm, employee.id);
  expect(rowsOf(before!.lines)).toEqual([
    ["entitlement_grant", "yearly_entitlement", 28, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-04-03", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-04-06", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-04", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-08-31", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-28", "policy_linked_to_terms"],
  ]);
  expect(before!.total).toEqual(20);

  await employeeServices(orm).updateEmployee(OWNER, { id: employee.id, startDate: "2026-07-01" });

  const [after] = await readAllowances(orm, employee.id);
  expect(rowsOf(after!.lines)).toEqual([
    ["entitlement_grant", "yearly_entitlement", 28, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-04-03", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-04-06", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-04", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-08-31", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-28", "policy_linked_to_terms"],
    ["entitlement_grant", "yearly_entitlement", -13.884932, "2026-01-01", "start_date_changed"],
    ["rounding_up_to_half_day", null, 0.384932, "2026-01-01", "start_date_changed"],
    ["bank_holiday_taken", null, 1, "2026-01-01", "start_date_changed"],
    ["bank_holiday_taken", null, 1, "2026-04-03", "start_date_changed"],
    ["bank_holiday_taken", null, 1, "2026-04-06", "start_date_changed"],
    ["bank_holiday_taken", null, 1, "2026-05-04", "start_date_changed"],
    ["bank_holiday_taken", null, 1, "2026-05-25", "start_date_changed"],
  ]);
  expect(after!.total).toEqual(11.5);
});

test("a September switch to Tuesday through Thursday cuts the grant and restores the December bank holidays", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
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
  expect(rowsOf(after!.lines)).toEqual([
    ["entitlement_grant", "yearly_entitlement", 28, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-04-03", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-04-06", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-04", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-08-31", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-28", "policy_linked_to_terms"],
    ["entitlement_grant", "yearly_entitlement", -3.743562, "2026-09-01", "working_pattern_changed"],
    ["bank_holiday_taken", null, 1, "2026-12-25", "working_pattern_changed"],
    ["bank_holiday_taken", null, 1, "2026-12-28", "working_pattern_changed"],
    ["rounding_up_to_half_day", null, 0.243562, "2026-09-01", "working_pattern_changed"],
  ]);
  expect(before!.total).toEqual(20);
  expect(after!.total).toEqual(18.5);
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

  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ total: 18 }]);
  expect(rowsOf(allowances[0]!.lines)).toEqual([
    ["entitlement_grant", "yearly_entitlement", 28, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-01-01", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-01-02", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-04-03", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-04", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-05-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-06-15", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-08-03", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-11-30", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-25", "policy_linked_to_terms"],
    ["bank_holiday_taken", null, -1, "2026-12-28", "policy_linked_to_terms"],
  ]);
});

test("ensuring the same allowance twice appends nothing the second time", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
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
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
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
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
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

/** Each line as [kind, rule kind, amount, effective date, cause]. */
function rowsOf(lines: readonly AllowanceLine[]) {
  return lines.map(({ kind, rule, amount, effectiveDate, causeKind }) => [
    kind,
    rule,
    amount,
    effectiveDate,
    causeKind,
  ]);
}
