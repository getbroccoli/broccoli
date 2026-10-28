import { ADMIN, EMPLOYEE, employeeUseCases, expect, OWNER, signedIn, test } from "#test/support";

test("allows an admin to make a joined employee an admin and records the change", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  const result = await employees.setPermissionProfile(ADMIN, {
    id: employee.id,
    profile: "ADMIN",
    changeReason: "Manages the workspace",
  });

  expect(result.employee).toEqual(employee);
  expect(result.historyLine).toMatchObject({
    recordId: employee.id,
    operation: "UPDATED",
    reason: "Manages the workspace",
    changes: [{ field: "permissionProfile", oldValue: "EMPLOYEE", newValue: "ADMIN" }],
  });
  expect(
    (await employees.readEmployeeHistory(OWNER, employee.id, {})).edges.map(({ node }) => node),
  ).toEqual([result.historyLine]);
  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, "ADMIN"]]),
  );
});

test("allows an admin to restore the employee profile", async ({ orm, seed }) => {
  const user = await seed.user({ email: "anna@example.com", permissionProfile: "ADMIN" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  const { historyLine } = await employees.setPermissionProfile(ADMIN, {
    id: employee.id,
    profile: "EMPLOYEE",
  });

  expect(historyLine?.changes).toEqual([
    { field: "permissionProfile", oldValue: "ADMIN", newValue: "EMPLOYEE" },
  ]);
  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, "EMPLOYEE"]]),
  );
});

test("records one profile change when two admins assign the same profile concurrently", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);
  const otherAdmin = signedIn(orm, { profile: "ADMIN", employeeId: null });

  await Promise.all([
    employees.setPermissionProfile(ADMIN, { id: employee.id, profile: "ADMIN" }),
    employees.setPermissionProfile(otherAdmin, { id: employee.id, profile: "ADMIN" }),
  ]);

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node.changes).toEqual([
    { field: "permissionProfile", oldValue: "EMPLOYEE", newValue: "ADMIN" },
  ]);
});

test.for(["ADMIN", "EMPLOYEE"] as const)(
  "records nothing when the profile is already %s",
  async (profile, { orm, seed }) => {
    const user = await seed.user({
      email: "anna@example.com",
      permissionProfile: profile === "ADMIN" ? "ADMIN" : null,
    });
    const employee = await seed.employee({ userId: user.id });
    const employees = employeeUseCases(orm);

    const result = await employees.setPermissionProfile(ADMIN, { id: employee.id, profile });

    expect(result).toEqual({ employee, historyLine: null });
    expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
  },
);

test("refuses changing the profile of an employee who has not joined", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(
    employeeUseCases(orm).setPermissionProfile(ADMIN, { id: employee.id, profile: "ADMIN" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "id", code: "not_joined" }],
  });
});

test("refuses changing the owner's permissions", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ userId: owner.user!.userId });
  const employees = employeeUseCases(orm);

  await expect(
    employees.setPermissionProfile(ADMIN, { id: employee.id, profile: "EMPLOYEE" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "The owner's permissions cannot change.",
  });

  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, "OWNER"]]),
  );
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test("refuses an employee assigning permission profiles", async ({ orm, seed }) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  await expect(
    employees.setPermissionProfile(EMPLOYEE, { id: employee.id, profile: "ADMIN" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only admins can do this.",
  });

  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, "EMPLOYEE"]]),
  );
});

test("refuses changing the profile of an unknown employee", async ({ orm }) => {
  await expect(
    employeeUseCases(orm).setPermissionProfile(ADMIN, {
      id: "00000000-0000-4000-8000-000000000001",
      profile: "ADMIN",
    }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No employee has this id.",
  });
});

test("reads joined employees' profiles and leaves out employees without a user", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "anna@example.com" });
  const joined = await seed.employee({ userId: user.id });
  const notJoined = await seed.employee();

  const profiles = await employeeUseCases(orm).readPermissionProfiles(EMPLOYEE, [
    joined.id,
    notJoined.id,
  ]);

  expect(profiles).toEqual(new Map([[joined.id, "EMPLOYEE"]]));
});
