import { sql } from "drizzle-orm";

import { employeeUseCases, expect, OWNER, test } from "#test/support";

test("returns the employee with the requested id", async ({ orm, seed }) => {
  const employee = await seed.employee();

  expect(await employeeUseCases(orm).readEmployee(OWNER, employee.id)).toEqual(employee);
});

test("returns null for an unknown employee", async ({ orm }) => {
  expect(
    await employeeUseCases(orm).readEmployee(OWNER, "00000000-0000-4000-8000-000000000001"),
  ).toBeNull();
});

test("returns history for an employee id written in uppercase", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, jobTitle: "Lead" });
  const history = await employees.readEmployeeHistory(OWNER, employee.id, {});

  const page = await employees.readEmployeeHistory(OWNER, employee.id.toUpperCase(), {});

  expect(history.edges).toHaveLength(1);
  expect(page).toEqual(history);
});

test("leaves out a person who never had a manager", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });

  expect(await employeeUseCases(orm).readManagers(OWNER, [employee.id])).toEqual(new Map());
});

test("returns the manager under every requested spelling of an employee id", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  // Letters ensure the two spellings differ, independent of the generated id.
  const id = "00000000-0000-4000-8000-00000000000a";
  // One statement, so the employment's reference is checked once both have the new id.
  await orm.execute(sql`
    with renamed as (update employees set id = ${id} where id = ${employee.id})
    update employments set employee_id = ${id} where employee_id = ${employee.id}`);
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id, managerId: manager.id });

  const managers = await employees.readManagers(OWNER, [id, id.toUpperCase()]);

  expect(managers).toEqual(
    new Map([
      [id, manager],
      [id.toUpperCase(), manager],
    ]),
  );
});
