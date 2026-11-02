import { employeeUseCases, expect, OWNER, signedIn, test } from "#test/support";

test("sets several employees' manager with a history line for each", async ({ orm, seed }) => {
  const avery = await seed.employee();
  const taylor = await seed.employee();
  const robin = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const employees = employeeUseCases(orm);

  const result = await employees.setManagers(OWNER, {
    employeeIds: [avery.id, taylor.id],
    managerId: robin.id,
  });

  expect(result.employees.map(({ id }) => id).sort()).toEqual([avery.id, taylor.id].sort());
  expect(await employees.readManagers(OWNER, [avery.id, taylor.id])).toEqual(
    new Map([
      [avery.id, robin],
      [taylor.id, robin],
    ]),
  );
  const averyHistory = await employees.readEmployeeHistory(OWNER, avery.id, {});
  const taylorHistory = await employees.readEmployeeHistory(OWNER, taylor.id, {});
  expect(averyHistory.edges).toHaveLength(1);
  expect(taylorHistory.edges).toHaveLength(1);
  const expected = {
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    changes: [
      {
        field: "manager",
        oldValue: null,
        newValue: robin.id,
        oldLabel: null,
        newLabel: "Robin Reed",
      },
    ],
  };
  expect(averyHistory.edges[0]!.node).toMatchObject(expected);
  expect(taylorHistory.edges[0]!.node).toMatchObject(expected);
});

test("skips the manager among the selected employees", async ({ orm, seed }) => {
  const avery = await seed.employee();
  const robin = await seed.employee();
  const employees = employeeUseCases(orm);

  await employees.setManagers(OWNER, { employeeIds: [avery.id, robin.id], managerId: robin.id });

  const managers = await employees.readManagers(OWNER, [avery.id, robin.id]);
  expect(managers.get(avery.id)).toEqual(robin);
  expect(managers.get(robin.id) ?? null).toBeNull();
  expect((await employees.readEmployeeHistory(OWNER, robin.id, {})).edges).toEqual([]);
});

test("clears selected employees' managers with null", async ({ orm, seed }) => {
  const avery = await seed.employee();
  const robin = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  await seed.manager(avery.id, robin.id);
  const employees = employeeUseCases(orm);

  await employees.setManagers(OWNER, { employeeIds: [avery.id], managerId: null });

  expect((await employees.readManagers(OWNER, [avery.id])).get(avery.id) ?? null).toBeNull();
  const history = await employees.readEmployeeHistory(OWNER, avery.id, {});
  expect(history.edges).toHaveLength(1);
  expect(history.edges[0]!.node).toMatchObject({
    cause: { kind: "EDITED_DIRECTLY" },
    changes: [
      {
        field: "manager",
        oldValue: robin.id,
        newValue: null,
        oldLabel: "Robin Reed",
        newLabel: null,
      },
    ],
  });
});

test("refuses the whole selection when one manager change would make a loop", async ({
  orm,
  seed,
}) => {
  const avery = await seed.employee();
  const robin = await seed.employee();
  const taylor = await seed.employee();
  await seed.manager(robin.id, avery.id);
  const employees = employeeUseCases(orm);
  const ids = [taylor.id, avery.id, robin.id];
  const before = await employees.readManagers(OWNER, ids);

  await expect(
    employees.setManagers(OWNER, { employeeIds: [taylor.id, avery.id], managerId: robin.id }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "managerId", code: "loop" }],
  });

  expect(await employees.readManagers(OWNER, ids)).toEqual(before);
  expect((await employees.readEmployeeHistory(OWNER, taylor.id, {})).edges).toEqual([]);
  expect((await employees.readEmployeeHistory(OWNER, avery.id, {})).edges).toEqual([]);
});

test("refuses an unknown employee", async ({ orm, seed }) => {
  const robin = await seed.employee();

  await expect(
    employeeUseCases(orm).setManagers(OWNER, {
      employeeIds: ["00000000-0000-4000-8000-000000000001"],
      managerId: robin.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("refuses a caller who cannot change managers", async ({ orm, seed }) => {
  const avery = await seed.employee();
  const robin = await seed.employee();
  const taylor = await seed.employee();
  await seed.manager(avery.id, robin.id);
  const caller = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: robin.id });
  const employees = employeeUseCases(orm);

  await expect(
    employees.setManagers(caller, { employeeIds: [avery.id], managerId: taylor.id }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    fieldErrors: [{ field: "managerId", code: "not_allowed" }],
  });

  expect((await employees.readManagers(OWNER, [avery.id])).get(avery.id)).toEqual(robin);
  expect((await employees.readEmployeeHistory(OWNER, avery.id, {})).edges).toEqual([]);
});
