import { employeeUseCases, expect, OWNER, recordChangedEvents, test } from "#test/support";

import type { EmployeeUseCases } from ".";

test("sets a person's manager and records their id and name", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const employees = employeeUseCases(orm);

  const { historyLine } = await employees.updateEmployee(OWNER, {
    id: employee.id,
    managerId: manager.id,
  });

  expect(await managerOf(employees, employee.id)).toEqual(manager);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toEqual(historyLine);
  expect(historyLine).toMatchObject({
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: null,
    changes: [
      {
        field: "manager",
        oldValue: null,
        newValue: manager.id,
        oldLabel: null,
        newLabel: "Robin Reed",
      },
    ],
  });
});

test("changes a manager and records both managers' ids and names", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const previous = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const next = await seed.employee({ firstName: "Taylor", lastName: "Brook" });
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, managerId: previous.id });

  const { historyLine } = await employees.updateEmployee(OWNER, {
    id: employee.id,
    managerId: next.id,
  });

  expect(await managerOf(employees, employee.id)).toEqual(next);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges[0]!.node).toEqual(historyLine);
  expect(historyLine).toMatchObject({
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    changes: [
      {
        field: "manager",
        oldValue: previous.id,
        newValue: next.id,
        oldLabel: "Robin Reed",
        newLabel: "Taylor Brook",
      },
    ],
  });
});

test("clears a manager and records their removed id and name", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, managerId: manager.id });

  const { historyLine } = await employees.updateEmployee(OWNER, {
    id: employee.id,
    managerId: null,
  });

  expect(await managerOf(employees, employee.id)).toBeNull();
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges[0]!.node).toEqual(historyLine);
  expect(historyLine).toMatchObject({
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    changes: [
      {
        field: "manager",
        oldValue: manager.id,
        newValue: null,
        oldLabel: "Robin Reed",
        newLabel: null,
      },
    ],
  });
});

test("leaves the manager unchanged when managerId is absent", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, managerId: manager.id });

  const { historyLine } = await employees.updateEmployee(OWNER, {
    id: employee.id,
    firstName: "Taylor",
  });

  expect(await managerOf(employees, employee.id)).toEqual(manager);
  expect(historyLine?.changes).toEqual([
    { field: "firstName", oldValue: "Avery", newValue: "Taylor" },
  ]);
});

test("setting the same manager again records nothing", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, managerId: manager.id });
  const before = await employees.readEmployeeHistory(OWNER, employee.id, {});
  const { transact, events } = recordChangedEvents(orm);

  const { historyLine } = await employeeUseCases(orm, { transact }).updateEmployee(OWNER, {
    id: employee.id,
    managerId: manager.id,
  });

  expect(historyLine).toBeNull();
  expect(await managerOf(employees, employee.id)).toEqual(manager);
  expect(await employees.readEmployeeHistory(OWNER, employee.id, {})).toEqual(before);
  expect(events).toEqual([]);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-a-uuid"])(
  "refuses an unknown manager %s without saving other fields",
  async (managerId, { orm, seed }) => {
    const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
    const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
    const employees = employeeUseCases(orm);
    await employees.updateEmployee(OWNER, { id: employee.id, managerId: manager.id });
    const before = await employees.readEmployeeHistory(OWNER, employee.id, {});

    await expect(
      employees.updateEmployee(OWNER, { id: employee.id, managerId, firstName: "Taylor" }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "managerId", code: "not_found" }],
    });

    expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
    expect(await managerOf(employees, employee.id)).toEqual(manager);
    expect(await employees.readEmployeeHistory(OWNER, employee.id, {})).toEqual(before);
  },
);

test("refuses making a person their own manager without changing them", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const employees = employeeUseCases(orm);

  await expect(
    employees.updateEmployee(OWNER, {
      id: employee.id,
      managerId: employee.id,
      firstName: "Taylor",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "managerId", code: "self" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect(await managerOf(employees, employee.id)).toBeNull();
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test("refuses a manager who reports through two levels without changing the reporting lines", async ({
  orm,
  seed,
}) => {
  const avery = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const robin = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const taylor = await seed.employee({ firstName: "Taylor", lastName: "Brook" });
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id: robin.id, managerId: avery.id });
  await employees.updateEmployee(OWNER, { id: taylor.id, managerId: robin.id });

  await expect(
    employees.updateEmployee(OWNER, {
      id: avery.id,
      managerId: taylor.id,
      firstName: "Quinn",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "managerId", code: "loop" }],
  });

  expect(await employees.readEmployee(OWNER, avery.id)).toEqual(avery);
  expect(await managerOf(employees, avery.id)).toBeNull();
  expect(await managerOf(employees, robin.id)).toEqual(avery);
  expect(await managerOf(employees, taylor.id)).toEqual(robin);
  expect((await employees.readEmployeeHistory(OWNER, avery.id, {})).edges).toEqual([]);
});

async function managerOf(employees: EmployeeUseCases, id: string) {
  return (await employees.readManagers(OWNER, [id])).get(id) ?? null;
}
