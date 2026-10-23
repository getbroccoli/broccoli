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
