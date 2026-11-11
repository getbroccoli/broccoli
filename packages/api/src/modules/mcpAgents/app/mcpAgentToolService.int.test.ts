import {
  employeeServices,
  expect,
  mcpAgentToolService,
  OWNER,
  signedIn,
  test,
} from "#test/support";

test("whoAmI returns the caller's email, profiles, employee and current manager", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee({ firstName: "Mia", jobTitle: "Lead" });
  const employee = await seed.employee({ firstName: "Ann" });
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: employee.id });

  const result = await mcpAgentToolService(orm).whoAmI(ctx);

  expect(result).toEqual({
    email: "user@example.com",
    permissionProfiles: ["EMPLOYEE"],
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      jobTitle: null,
    },
    manager: {
      id: manager.id,
      firstName: manager.firstName,
      lastName: manager.lastName,
      email: manager.email,
      jobTitle: "Lead",
    },
  });
});

test("whoAmI returns no employee or manager for a user without an employee", async ({
  orm,
  seed,
}) => {
  await seed.employee();

  const result = await mcpAgentToolService(orm).whoAmI(OWNER);

  expect(result).toEqual({
    email: "owner@example.com",
    permissionProfiles: ["EMPLOYEE", "OWNER"],
    employee: null,
    manager: null,
  });
});

test("findPeople returns the same people as the employee list within the caller's scope", async ({
  orm,
  seed,
}) => {
  const mia = await seed.employee({ firstName: "Mia" });
  const ann = await seed.employee({ firstName: "Ann" });
  const outsider = await seed.employee({ firstName: "Zed" });
  await seed.manager(ann.id, mia.id);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [
      { key: "employee.read.self", object: "employee", actions: ["read"], scope: "self" },
      { key: "employee.read.reports", object: "employee", actions: ["read"], scope: "all_reports" },
    ],
  });
  const employees = await employeeServices(orm).listEmployees(ctx, { first: 25 });

  const result = await mcpAgentToolService(orm).findPeople(ctx, {});

  expect(employees.edges.map(({ node }) => node.id)).toEqual([ann.id, mia.id]);
  expect(result).toEqual({
    people: employees.edges.map(({ node: { id, firstName, lastName, email, jobTitle } }) => ({
      id,
      firstName,
      lastName,
      email,
      jobTitle,
    })),
    nextCursor: null,
  });
  expect(result.people).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: outsider.id })]),
  );
});

test("findPeople returns only people matching the search", async ({ orm, seed }) => {
  const ann = await seed.employee({ firstName: "Ann", lastName: "Stone" });
  await seed.employee({ firstName: "Ben", lastName: "Reed" });

  const result = await mcpAgentToolService(orm).findPeople(OWNER, { search: "Ann" });

  expect(result).toEqual({
    people: [{ id: ann.id, firstName: "Ann", lastName: "Stone", email: ann.email, jobTitle: null }],
    nextCursor: null,
  });
});
