import { ADMIN, employeeUseCases, expect, OWNER, signedIn, test } from "#test/support";

test("allows an employee to change their own first name", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeUseCases(orm);

  await employees.updateEmployee(ctx, {
    id: anna.id,
    firstName: "Anne",
    changeReason: "Preferred name",
  });

  expect(await employees.readEmployee(OWNER, anna.id)).toMatchObject({ firstName: "Anne" });
});

test("refuses an employee changing their own job title without saving their name", async ({
  orm,
  seed,
}) => {
  const anna = await seed.employee({ firstName: "Anna", jobTitle: "Engineer" });
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeUseCases(orm);

  await expect(
    employees.updateEmployee(ctx, { id: anna.id, firstName: "Anne", jobTitle: "Lead" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot change some of these fields.",
    fieldErrors: [{ field: "jobTitle", code: "not_allowed" }],
  });

  expect(await employees.readEmployee(OWNER, anna.id)).toEqual(anna);
  expect((await employees.readEmployeeHistory(OWNER, anna.id, {})).edges).toEqual([]);
});

test("allows a manager to change their direct report's job title", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  await seed.manager(ben.id, anna.id);
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeUseCases(orm);

  await employees.updateEmployee(ctx, { id: ben.id, jobTitle: "Lead" });

  expect(await employees.readEmployee(OWNER, ben.id)).toMatchObject({ jobTitle: "Lead" });
});

test("allows a manager to change a report's job title through another manager", async ({
  orm,
  seed,
}) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  const carl = await seed.employee({ firstName: "Carl" });
  await seed.manager(ben.id, anna.id);
  await seed.manager(carl.id, ben.id);
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeUseCases(orm);

  await employees.updateEmployee(ctx, { id: carl.id, jobTitle: "Lead" });

  expect(await employees.readEmployee(OWNER, carl.id)).toMatchObject({ jobTitle: "Lead" });
});

test.for(["email", "managerId"] as const)(
  "refuses a manager changing a report's %s",
  async (field, { orm, seed }) => {
    const anna = await seed.employee({ firstName: "Anna" });
    const ben = await seed.employee({ firstName: "Ben" });
    const other = await seed.employee();
    await seed.manager(ben.id, anna.id);
    const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
    const employees = employeeUseCases(orm);
    const changes = field === "email" ? { email: "changed@example.com" } : { managerId: other.id };

    await expect(employees.updateEmployee(ctx, { id: ben.id, ...changes })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot change some of these fields.",
      fieldErrors: [{ field, code: "not_allowed" }],
    });

    expect(await employees.readEmployee(OWNER, ben.id)).toEqual(ben);
    expect((await employees.readManagers(OWNER, [ben.id])).get(ben.id)).toEqual(anna);
  },
);

test("returns refused fields in the order sent", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });

  await expect(
    employeeUseCases(orm).updateEmployee(ctx, {
      id: anna.id,
      managerId: null,
      email: "changed@example.com",
      jobTitle: "Lead",
    }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    fieldErrors: [
      { field: "managerId", code: "not_allowed" },
      { field: "email", code: "not_allowed" },
      { field: "jobTitle", code: "not_allowed" },
    ],
  });
});

test("refuses a manager changing a coworker outside their reporting line", async ({
  orm,
  seed,
}) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  const coworker = await seed.employee();
  await seed.manager(ben.id, anna.id);
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeUseCases(orm);

  await expect(
    employees.updateEmployee(ctx, { id: coworker.id, jobTitle: "Lead" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are not allowed to do this.",
  });

  expect(await employees.readEmployee(OWNER, coworker.id)).toEqual(coworker);
});

test("refuses a manager after their report moves outside their reporting line", async ({
  orm,
  seed,
}) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  const other = await seed.employee();
  await seed.manager(ben.id, anna.id);
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(ctx, { id: ben.id, jobTitle: "Engineer" });
  await seed.manager(ben.id, other.id);
  const nextRequest = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });

  await expect(
    employees.updateEmployee(nextRequest, { id: ben.id, jobTitle: "Lead" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are not allowed to do this.",
  });

  expect(await employees.readEmployee(OWNER, ben.id)).toMatchObject({ jobTitle: "Engineer" });
});

test("allows an employee to manage their first report without a profile change", async ({
  orm,
  seed,
}) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  const carl = await seed.employee({ firstName: "Carl" });
  const dan = await seed.employee({ firstName: "Dan" });
  await seed.manager(ben.id, anna.id);
  await seed.manager(carl.id, ben.id);
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: carl.id });
  const employees = employeeUseCases(orm);
  await expect(
    employees.updateEmployee(ctx, { id: dan.id, jobTitle: "Lead" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await seed.manager(dan.id, carl.id);
  const nextRequest = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: carl.id });

  await employees.updateEmployee(nextRequest, { id: dan.id, jobTitle: "Lead" });

  expect(await employees.readEmployee(OWNER, dan.id)).toMatchObject({ jobTitle: "Lead" });
});

test("allows an admin without an employee to change every employee update field", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const manager = await seed.employee();
  const employees = employeeUseCases(orm);
  const changes = {
    firstName: "Anna",
    lastName: "Reed",
    email: "anna@example.com",
    jobTitle: "Lead",
    startDate: "2026-01-01",
  };

  await employees.updateEmployee(ADMIN, { id: employee.id, ...changes, managerId: manager.id });

  expect(await employees.readEmployee(OWNER, employee.id)).toMatchObject(changes);
  expect((await employees.readManagers(OWNER, [employee.id])).get(employee.id)).toEqual(manager);
});
