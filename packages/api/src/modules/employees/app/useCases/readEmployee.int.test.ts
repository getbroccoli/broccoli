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

test("returns null for a person who never had a manager", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });

  expect(await employeeUseCases(orm).readManager(OWNER, employee.id)).toBeNull();
});
