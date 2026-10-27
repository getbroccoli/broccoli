import { employeeUseCases, expect, NON_OWNER, SETUP_HOLDER, test } from "#test/support";

import type { SecurityContext } from "../../../../core/security";
import type { EmployeeUseCases } from ".";

const calls = {
  createEmployee: (useCases, ctx) =>
    useCases.createEmployee(ctx, {
      firstName: "Employee",
      lastName: "One",
      email: "employee.one@example.com",
    }),
  listEmployees: (useCases, ctx) => useCases.listEmployees(ctx, {}),
  readEmployee: (useCases, ctx) =>
    useCases.readEmployee(ctx, "00000000-0000-4000-8000-000000000001"),
  readManager: (useCases, ctx) => useCases.readManager(ctx, "00000000-0000-4000-8000-000000000001"),
  updateEmployee: (useCases, ctx) =>
    useCases.updateEmployee(ctx, { id: "00000000-0000-4000-8000-000000000001", jobTitle: "Lead" }),
  deleteEmployee: (useCases, ctx) =>
    useCases.deleteEmployee(ctx, { id: "00000000-0000-4000-8000-000000000001" }),
  readEmployeeHistory: (useCases, ctx) =>
    useCases.readEmployeeHistory(ctx, "00000000-0000-4000-8000-000000000001", {}),
  readAvatar: (useCases, ctx) => useCases.readAvatar(ctx, "00000000-0000-4000-8000-000000000001"),
} satisfies Record<
  keyof EmployeeUseCases,
  (useCases: EmployeeUseCases, ctx: SecurityContext) => Promise<unknown>
>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm }) => {
    const useCases = employeeUseCases(orm);

    await expect(call(useCases, NON_OWNER)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);

test("refuses the setup holder listing employees", async ({ orm }) => {
  const employees = employeeUseCases(orm);

  await expect(employees.listEmployees(SETUP_HOLDER, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the owner can do this.",
  });
});
