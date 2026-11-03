import {
  allowanceIdentitySums,
  allowanceSnapshot,
  employeeServices,
  expect,
  linkStatutoryMinimumToEveryone,
  OWNER,
  readAllowances,
  test,
} from "#test/support";

test("restoring a January start after a December correction restores every dated ledger identity", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2026-01-01" });
  await linkStatutoryMinimumToEveryone(orm, seed, transact);
  const [before] = await allowanceSnapshot(orm, employee.id);
  const employees = employeeServices(orm);

  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2026-12-01" });
  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2026-01-01" });

  const [after] = await allowanceSnapshot(orm, employee.id);
  expect(after!.allowance).toEqual(before!.allowance);
  expect(after!.lines.slice(0, before!.lines.length)).toEqual(before!.lines);
  for (const date of new Set(after!.lines.map(({ effectiveDate }) => effectiveDate))) {
    expect(
      allowanceIdentitySums(after!.lines.filter(({ effectiveDate }) => effectiveDate === date)),
    ).toEqual(
      allowanceIdentitySums(before!.lines.filter(({ effectiveDate }) => effectiveDate === date)),
    );
  }
});

test("a second start correction takes effect from the previous start rather than the first grant", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2026-01-01" });
  await linkStatutoryMinimumToEveryone(orm, seed, transact);
  const employees = employeeServices(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2026-07-01" });
  const [before] = await readAllowances(orm, employee.id);

  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2026-10-01" });

  const [after] = await readAllowances(orm, employee.id);
  const corrections = after!.lines
    .slice(before!.lines.length)
    .filter(({ kind }) => kind !== "bank_holiday_taken");
  expect(corrections.map(({ kind, effectiveDate }) => ({ kind, effectiveDate }))).toEqual([
    { kind: "entitlement_grant", effectiveDate: "2026-07-01" },
    { kind: "rounding_up_to_half_day", effectiveDate: "2026-07-01" },
  ]);
});

test("moving a start into another year keeps corrections within their retained allowance years", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2026-07-01" });
  await linkStatutoryMinimumToEveryone(orm, seed, transact);
  const employees = employeeServices(orm);

  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2027-02-01" });

  const moved = await readAllowances(orm, employee.id);
  expect(moved).toHaveLength(2);
  expect(moved[0]!.total).toBeCloseTo(0, 6);
  expect(moved[1]!.lines.find(({ kind }) => kind === "entitlement_grant")).toMatchObject({
    effectiveDate: "2027-02-01",
  });
  for (const allowance of moved) {
    for (const { effectiveDate } of allowance.lines) {
      expect(effectiveDate >= allowance.leaveYearStart).toBe(true);
      expect(effectiveDate <= allowance.leaveYearEnd).toBe(true);
    }
  }
});
