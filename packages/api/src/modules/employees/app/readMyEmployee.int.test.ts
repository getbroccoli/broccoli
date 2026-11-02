import { employeeUseCases, expect, signedIn, test } from "#test/support";

test("returns only the employee linked to the signed-in user", async ({ orm, seed }) => {
  await seed.employee();
  const employee = await seed.employee();
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: employee.id });

  const mine = await employeeUseCases(orm).readMyEmployee(ctx);

  expect(mine).toEqual(employee);
});

test("returns no employee for the owner", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.employee();

  expect(await employeeUseCases(orm).readMyEmployee(owner)).toBeNull();
});

test("returns no employee for a user without a linked employee", async ({ orm, seed }) => {
  await seed.employee();
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: null });

  expect(await employeeUseCases(orm).readMyEmployee(ctx)).toBeNull();
});
