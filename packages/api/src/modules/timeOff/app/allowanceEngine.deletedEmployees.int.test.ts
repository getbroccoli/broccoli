import {
  employeeServices,
  expect,
  linkStatutoryMinimumToEveryone,
  OWNER,
  readAllowances,
  SYSTEM,
  test,
  timeOffService,
} from "#test/support";

test("ensuring allowances skips a deleted employee and commits allowances for the others", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToEveryone(orm, seed, transact);
  const deleted = await seed.employee({ startDate: "2025-01-01" });
  const remaining = await seed.employee({ startDate: "2025-01-01" });
  await employeeServices(orm).deleteEmployee(OWNER, { id: deleted.id });

  const result = await transact((tx) =>
    timeOffService(orm).ensureAllowances(SYSTEM, tx, {
      employeeIds: [deleted.id, remaining.id],
      cause: { kind: "DAILY_CHECK", ref: "2026-06-01" },
    }),
  );

  expect(result).toEqual({ allowancesCreated: 1, linesAppended: 9 });
  expect(await readAllowances(orm, remaining.id)).toMatchObject([
    { typeKey: "annual_leave", total: 20 },
  ]);
  expect(await readAllowances(orm, deleted.id)).toEqual([]);
});

test("ensuring allowances writes nothing when every employee was deleted", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToEveryone(orm, seed, transact);
  const deleted = await seed.employee({ startDate: "2025-01-01" });
  await employeeServices(orm).deleteEmployee(OWNER, { id: deleted.id });

  const result = await transact((tx) =>
    timeOffService(orm).ensureAllowances(SYSTEM, tx, {
      employeeIds: [deleted.id],
      cause: { kind: "DAILY_CHECK", ref: "2026-06-01" },
    }),
  );

  expect(result).toEqual({ allowancesCreated: 0, linesAppended: 0 });
  expect(await readAllowances(orm, deleted.id)).toEqual([]);
});
