import { expect, OWNER, test } from "#test/support";

import { createEmployeeUseCases } from ".";

test("creates an employee and returns it normalised", async ({ orm }) => {
  const { createEmployee } = createEmployeeUseCases({ orm });

  const employee = await createEmployee(OWNER, {
    firstName: "  Employee  ",
    lastName: "  One  ",
    email: "  Employee.One@EXAMPLE.COM  ",
    jobTitle: "  Engineer  ",
    startDate: "2026-02-28",
  });

  expect(employee).toMatchObject({
    firstName: "Employee",
    lastName: "One",
    email: "employee.one@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  });
  expect(employee.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  expect(employee.createdAt).toBeInstanceOf(Date);
});

test("refuses an email that differs only in case", async ({ orm, seed }) => {
  const { createEmployee } = createEmployeeUseCases({ orm });
  await seed.employee({ email: "employee.one@example.com" });

  await expect(
    createEmployee(OWNER, {
      firstName: "Employee",
      lastName: "Two",
      email: "EMPLOYEE.ONE@EXAMPLE.COM",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    message: "The input is invalid.",
    fieldErrors: [{ field: "email", code: "taken" }],
  });
});

test("refuses invalid input with one field error per field", async ({ orm }) => {
  const { createEmployee } = createEmployeeUseCases({ orm });

  await expect(
    createEmployee(OWNER, {
      firstName: "   ",
      lastName: "One",
      email: "not-an-email",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    message: "The input is invalid.",
    fieldErrors: [
      { field: "firstName", code: "required" },
      { field: "email", code: "invalid" },
    ],
  });
});
