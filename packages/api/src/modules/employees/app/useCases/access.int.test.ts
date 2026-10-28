import {
  ADMIN,
  employeeUseCases,
  EMPLOYEE,
  expect,
  OWNER,
  SETUP_HOLDER,
  test,
  WEBP,
} from "#test/support";

import type { SecurityContext } from "../../../../core/security";
import type { EmployeeUseCases } from ".";

const reads = {
  listEmployees: (employees, ctx) => employees.listEmployees(ctx, {}),
  readEmployee: (employees, ctx, id) => employees.readEmployee(ctx, id),
  readManagers: (employees, ctx, id) => employees.readManagers(ctx, [id]),
  readEmployeeHistory: (employees, ctx, id) => employees.readEmployeeHistory(ctx, id, {}),
  readPermissionProfiles: (employees, ctx, id) => employees.readPermissionProfiles(ctx, [id]),
  readAvatar: (employees, ctx, _id, avatarFileId) => employees.readAvatar(ctx, avatarFileId),
} satisfies Record<
  string,
  (
    employees: EmployeeUseCases,
    ctx: SecurityContext,
    id: string,
    avatarFileId: string,
  ) => Promise<unknown>
>;

for (const [profile, ctx] of [
  ["EMPLOYEE", EMPLOYEE],
  ["ADMIN", ADMIN],
  ["OWNER", OWNER],
] as const) {
  test.for(Object.entries(reads))(`${profile} may call %s`, async ([, call], { orm, seed }) => {
    const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
    const employee = await seed.employee({ avatarFileId });

    await expect(
      call(employeeUseCases(orm), ctx, employee.id, avatarFileId),
    ).resolves.toBeDefined();
  });
}

const writes = {
  createEmployee: (employees, ctx) =>
    employees.createEmployee(ctx, {
      firstName: "Anna",
      lastName: "Reed",
      email: "anna@example.com",
    }),
  updateEmployee: (employees, ctx, id) => employees.updateEmployee(ctx, { id, jobTitle: "Lead" }),
  deleteEmployee: (employees, ctx, id) => employees.deleteEmployee(ctx, { id }),
  setPermissionProfiles: (employees, ctx, id) =>
    employees.setPermissionProfiles(ctx, { id, profiles: ["ADMIN"] }),
} satisfies Record<
  string,
  (employees: EmployeeUseCases, ctx: SecurityContext, id: string) => Promise<unknown>
>;

for (const [profile, ctx] of [
  ["ADMIN", ADMIN],
  ["OWNER", OWNER],
] as const) {
  test.for(Object.entries(writes))(`${profile} may call %s`, async ([, call], { orm, seed }) => {
    const user = await seed.user({ email: "joined@example.com" });
    const employee = await seed.employee({ userId: user.id });

    await expect(call(employeeUseCases(orm), ctx, employee.id)).resolves.toBeDefined();
  });
}

test.for(Object.entries(writes))("EMPLOYEE is refused %s", async ([name, call], { orm, seed }) => {
  const employee = await seed.employee();

  await expect(call(employeeUseCases(orm), EMPLOYEE, employee.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message:
      name === "setPermissionProfiles"
        ? "Only admins can do this."
        : "You are not allowed to do this.",
    fieldErrors: [],
  });
});

test("refuses the setup holder listing employees", async ({ orm }) => {
  await expect(employeeUseCases(orm).listEmployees(SETUP_HOLDER, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are not allowed to do this.",
  });
});
