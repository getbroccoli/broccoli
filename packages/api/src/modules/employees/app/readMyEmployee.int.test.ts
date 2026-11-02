import { employeeServices, expect, signedIn, test } from "#test/support";

test("returns only the employee linked to the signed-in user", async ({ orm, seed }) => {
  await seed.employee();
  const employee = await seed.employee();
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: employee.id });

  const mine = await employeeServices(orm).readMyEmployee(ctx);

  expect(mine).toEqual(employee);
});

test("returns no employee for the owner", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.employee();

  expect(await employeeServices(orm).readMyEmployee(owner)).toBeNull();
});

test("returns no employee for a user without a linked employee", async ({ orm, seed }) => {
  await seed.employee();
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: null });

  expect(await employeeServices(orm).readMyEmployee(ctx)).toBeNull();
});
