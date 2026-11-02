import { assert } from "vitest";

import {
  ADMIN,
  EMPLOYEE,
  employeeServices,
  expect,
  expectHistoryReplaysTo,
  OWNER,
  signedIn,
  test,
} from "#test/support";

test("sets a person's location and records its id and name", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const employees = employeeServices(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);

  const { historyLine } = await employees.updateEmployee(ADMIN, {
    id: employee.id,
    locationId: location.id,
  });

  expect(await employees.readEmployee(EMPLOYEE, employee.id)).toMatchObject({
    locationId: location.id,
  });
  expect(historyLine).toMatchObject({
    operation: "UPDATED",
    changes: [
      {
        field: "location",
        oldValue: null,
        newValue: location.id,
        oldLabel: null,
        newLabel: "Leeds",
      },
    ],
  });
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges[0]!.node).toEqual(
    historyLine,
  );
  await expectHistoryReplaysTo(orm, employee.id);
});

test("changes a location and records both locations' ids and names", async ({ orm, seed }) => {
  const previous = await seed.location("Leeds");
  const next = await seed.location("York");
  const employee = await seed.employee({ locationId: previous.id });
  const employees = employeeServices(orm);

  const { historyLine } = await employees.updateEmployee(OWNER, {
    id: employee.id,
    locationId: next.id,
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toMatchObject({ locationId: next.id });
  expect(historyLine?.changes).toEqual([
    {
      field: "location",
      oldValue: previous.id,
      newValue: next.id,
      oldLabel: "Leeds",
      newLabel: "York",
    },
  ]);
});

test("clears a location and records the removed id and name", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const employee = await seed.employee({ locationId: location.id });
  const employees = employeeServices(orm);

  const { historyLine } = await employees.updateEmployee(ADMIN, {
    id: employee.id,
    locationId: null,
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toMatchObject({ locationId: null });
  expect(historyLine?.changes).toEqual([
    { field: "location", oldValue: location.id, newValue: null, oldLabel: "Leeds", newLabel: null },
  ]);
});

test("leaves the location unchanged when locationId is absent", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const employee = await seed.employee({ locationId: location.id });
  const employees = employeeServices(orm);

  await employees.updateEmployee(OWNER, { id: employee.id, jobTitle: "Engineer" });

  expect(await employees.readEmployee(OWNER, employee.id)).toMatchObject({
    locationId: location.id,
  });
});

test("keeps history labels when the locations are renamed later", async ({ orm, seed }) => {
  const previous = await seed.location("Leeds");
  const next = await seed.location("York");
  const employee = await seed.employee({ locationId: previous.id });
  const employees = employeeServices(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, locationId: next.id });

  await employees.updateLocation(OWNER, { id: previous.id, name: "Leeds office" });
  await employees.updateLocation(OWNER, { id: next.id, name: "York office" });

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node.changes).toEqual([
    {
      field: "location",
      oldValue: previous.id,
      newValue: next.id,
      oldLabel: "Leeds",
      newLabel: "York",
    },
  ]);
});

test("refuses a location id that names no location without saving other changes", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ firstName: "Avery" });
  const employees = employeeServices(orm);

  await expect(
    employees.updateEmployee(OWNER, {
      id: employee.id,
      firstName: "Robin",
      locationId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "locationId", code: "not_found" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test("refuses an employee changing their own location", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const location = await seed.location("Leeds");
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: employee.id });
  const employees = employeeServices(orm);

  await expect(
    employees.updateEmployee(ctx, { id: employee.id, locationId: location.id }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot change some of these fields.",
    fieldErrors: [{ field: "locationId", code: "not_allowed" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test("refuses a manager changing a report's location", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  const location = await seed.location("Leeds");
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: manager.id });
  const employees = employeeServices(orm);

  await expect(
    employees.updateEmployee(ctx, { id: employee.id, locationId: location.id }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot change some of these fields.",
    fieldErrors: [{ field: "locationId", code: "not_allowed" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});
