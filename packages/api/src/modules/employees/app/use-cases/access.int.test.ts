import { expect, test } from "#test/support";

import type { Actor } from "../../../../core/actor";
import { createEmployeeUseCases, type EmployeeUseCases } from ".";

const calls = {
  createEmployee: (useCases, actor) =>
    useCases.createEmployee(actor, {
      firstName: "Employee",
      lastName: "One",
      email: "employee.one@example.com",
    }),
  listEmployees: (useCases, actor) => useCases.listEmployees(actor, {}),
} satisfies Record<
  keyof EmployeeUseCases,
  (useCases: EmployeeUseCases, actor: Actor | null) => Promise<unknown>
>;

test.for(Object.entries(calls))("%s refuses an anonymous actor", async ([, call], { orm }) => {
  const useCases = createEmployeeUseCases({ orm });

  await expect(call(useCases, null)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
    message: "Sign in to continue.",
    fieldErrors: [],
  });
});

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm }) => {
    const useCases = createEmployeeUseCases({ orm });

    await expect(call(useCases, { userId: "user-1", isOwner: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
