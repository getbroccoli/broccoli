import { sql } from "drizzle-orm";

import { employeeServices, expect, OWNER, signedIn, test } from "#test/support";

test("returns the employee with the requested id", async ({ orm, seed }) => {
  const employee = await seed.employee();

  expect(await employeeServices(orm).readEmployee(OWNER, employee.id)).toEqual(employee);
});

test("returns null for an unknown employee", async ({ orm }) => {
  expect(
    await employeeServices(orm).readEmployee(OWNER, "00000000-0000-4000-8000-000000000001"),
  ).toBeNull();
});

test("returns the requested employees keyed by their ids", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  await seed.employee({ firstName: "Carl" });

  const employees = await employeeServices(orm).readEmployees(OWNER, [ben.id, anna.id]);

  expect(employees).toEqual(
    new Map([
      [anna.id, anna],
      [ben.id, ben],
    ]),
  );
});

test("leaves unknown ids out of a batch of employees", async ({ orm, seed }) => {
  const employee = await seed.employee();

  const employees = await employeeServices(orm).readEmployees(OWNER, [
    "00000000-0000-4000-8000-000000000001",
    employee.id,
  ]);

  expect(employees).toEqual(new Map([[employee.id, employee]]));
});

test("leaves malformed ids out of a batch without losing valid employees", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();

  const employees = await employeeServices(orm).readEmployees(OWNER, [
    "not-an-id",
    employee.id,
    "",
  ]);

  expect(employees).toEqual(new Map([[employee.id, employee]]));
});

test("leaves employees outside the caller's read scope out of a batch", async ({ orm, seed }) => {
  const caller = await seed.employee();
  const report = await seed.employee();
  const other = await seed.employee();
  await seed.manager(report.id, caller.id);
  const ctx = signedIn(orm, {
    employeeId: caller.id,
    grants: [
      { key: "employee.read.self", object: "employee", actions: ["read"], scope: "self" },
      { key: "employee.read.reports", object: "employee", actions: ["read"], scope: "all_reports" },
    ],
  });

  const employees = await employeeServices(orm).readEmployees(ctx, [
    other.id,
    caller.id,
    report.id,
  ]);

  expect(employees).toEqual(
    new Map([
      [caller.id, caller],
      [report.id, report],
    ]),
  );
});

test("returns history for an employee id written in uppercase", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const employees = employeeServices(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, jobTitle: "Lead" });
  const history = await employees.readEmployeeHistory(OWNER, employee.id, {});

  const page = await employees.readEmployeeHistory(OWNER, employee.id.toUpperCase(), {});

  expect(history.edges).toHaveLength(1);
  expect(page).toEqual(history);
});

test("leaves out a person who never had a manager", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });

  expect(await employeeServices(orm).readManagers(OWNER, [employee.id])).toEqual(new Map());
});

test("returns the manager under every requested spelling of an employee id", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  // Letters ensure the two spellings differ, independent of the generated id.
  const id = "00000000-0000-4000-8000-00000000000a";
  // One statement, so the references are checked once every row has the new id.
  await orm.execute(sql`
    with renamed as (update employees set id = ${id} where id = ${employee.id}),
      grouped as (update employee_terms set employee_id = ${id}
        where employee_id = ${employee.id})
    update employments set employee_id = ${id} where employee_id = ${employee.id}`);
  const employees = employeeServices(orm);
  await employees.updateEmployee(OWNER, { id, managerId: manager.id });

  const managers = await employees.readManagers(OWNER, [id, id.toUpperCase()]);

  expect(managers).toEqual(
    new Map([
      [id, manager],
      [id.toUpperCase(), manager],
    ]),
  );
});
