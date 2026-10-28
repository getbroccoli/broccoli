import { ADMIN, EMPLOYEE, employeeUseCases, expect, OWNER, signedIn, test } from "#test/support";

test("allows an admin to make a joined employee an admin and records the change", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  const result = await employees.setPermissionProfiles(ADMIN, {
    id: employee.id,
    profiles: ["ADMIN"],
    changeReason: "Manages the workspace",
  });

  expect(result.employee).toEqual(employee);
  expect(result.historyLine).toMatchObject({
    recordId: employee.id,
    operation: "UPDATED",
    reason: "Manages the workspace",
    changes: [{ field: "permissionProfiles", oldValue: "EMPLOYEE", newValue: "EMPLOYEE, ADMIN" }],
  });
  expect(
    (await employees.readEmployeeHistory(OWNER, employee.id, {})).edges.map(({ node }) => node),
  ).toEqual([result.historyLine]);
  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, ["EMPLOYEE", "ADMIN"]]]),
  );
});

test("allows an admin to remove ADMIN and records the change", async ({ orm, seed }) => {
  const user = await seed.user({ email: "anna@example.com", permissionProfiles: ["ADMIN"] });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  const { historyLine } = await employees.setPermissionProfiles(ADMIN, {
    id: employee.id,
    profiles: [],
  });

  expect(historyLine?.changes).toEqual([
    { field: "permissionProfiles", oldValue: "EMPLOYEE, ADMIN", newValue: "EMPLOYEE" },
  ]);
  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, ["EMPLOYEE"]]]),
  );
});

test("stores ADMIN once and never stores the base profile", async ({ orm, seed }) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  await employees.setPermissionProfiles(ADMIN, {
    id: employee.id,
    profiles: ["EMPLOYEE", "ADMIN", "ADMIN"],
  });

  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, ["EMPLOYEE", "ADMIN"]]]),
  );
});

test("refuses assigning OWNER", async ({ orm, seed }) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  await expect(
    employees.setPermissionProfiles(ADMIN, { id: employee.id, profiles: ["OWNER"] }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "profiles", code: "not_assignable" }],
  });

  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, ["EMPLOYEE"]]]),
  );
});

test("records one profile change when two admins assign the same profiles concurrently", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);
  const otherAdmin = signedIn(orm, { profiles: ["EMPLOYEE", "ADMIN"], employeeId: null });

  await Promise.all([
    employees.setPermissionProfiles(ADMIN, { id: employee.id, profiles: ["ADMIN"] }),
    employees.setPermissionProfiles(otherAdmin, { id: employee.id, profiles: ["ADMIN"] }),
  ]);

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node.changes).toEqual([
    { field: "permissionProfiles", oldValue: "EMPLOYEE", newValue: "EMPLOYEE, ADMIN" },
  ]);
});

test.for(["ADMIN", "EMPLOYEE"] as const)(
  "records nothing when the profile is already %s",
  async (profile, { orm, seed }) => {
    const user = await seed.user({
      email: "anna@example.com",
      permissionProfiles: profile === "ADMIN" ? ["ADMIN"] : [],
    });
    const employee = await seed.employee({ userId: user.id });
    const employees = employeeUseCases(orm);

    const result = await employees.setPermissionProfiles(ADMIN, {
      id: employee.id,
      profiles: [profile],
    });

    expect(result).toEqual({ employee, historyLine: null });
    expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
  },
);

test("refuses changing the profile of an employee who has not joined", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(
    employeeUseCases(orm).setPermissionProfiles(ADMIN, { id: employee.id, profiles: ["ADMIN"] }),
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
    employees.setPermissionProfiles(ADMIN, { id: employee.id, profiles: ["EMPLOYEE"] }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "The owner's permissions cannot change.",
  });

  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, ["EMPLOYEE", "OWNER"]]]),
  );
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test("refuses an employee assigning permission profiles", async ({ orm, seed }) => {
  const user = await seed.user({ email: "anna@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const employees = employeeUseCases(orm);

  await expect(
    employees.setPermissionProfiles(EMPLOYEE, { id: employee.id, profiles: ["ADMIN"] }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only admins can do this.",
  });

  expect(await employees.readPermissionProfiles(OWNER, [employee.id])).toEqual(
    new Map([[employee.id, ["EMPLOYEE"]]]),
  );
});

test("refuses changing the profile of an unknown employee", async ({ orm }) => {
  await expect(
    employeeUseCases(orm).setPermissionProfiles(ADMIN, {
      id: "00000000-0000-4000-8000-000000000001",
      profiles: ["ADMIN"],
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

  expect(profiles).toEqual(new Map([[joined.id, ["EMPLOYEE"]]]));
});
