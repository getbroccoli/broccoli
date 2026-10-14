import { expect, NON_OWNER, test } from "#test/support";

import type { SecurityContext } from "../../../../core/security";
import { createEmployeeUseCases, type EmployeeUseCases } from ".";

const calls = {
  createEmployee: (useCases, ctx) =>
    useCases.createEmployee(ctx, {
      firstName: "Employee",
      lastName: "One",
      email: "employee.one@example.com",
    }),
  listEmployees: (useCases, ctx) => useCases.listEmployees(ctx, {}),
  isEmployeeAvatarFile: (useCases, ctx) =>
    useCases.isEmployeeAvatarFile(ctx, "00000000-0000-4000-8000-000000000001"),
} satisfies Record<
  keyof EmployeeUseCases,
  (useCases: EmployeeUseCases, ctx: SecurityContext) => Promise<unknown>
>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm }) => {
    const useCases = createEmployeeUseCases({ orm });

    await expect(call(useCases, NON_OWNER)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
