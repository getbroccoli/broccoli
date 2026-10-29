import { assert } from "vitest";

import { employeeUseCases, expectHistoryReplaysTo, expect, OWNER, test } from "#test/support";

test("creates an employee and returns it normalised", async ({ orm }) => {
  const { createEmployee } = employeeUseCases(orm);

  const employee = await createEmployee(OWNER, {
    firstName: "  Employee  ",
    lastName: "  One  ",
    email: "  Employee.One@EXAMPLE.COM  ",
    jobTitle: "  Engineer  ",
    startDate: "2026-02-28",
  });
  assert(employee);

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
  const { createEmployee } = employeeUseCases(orm);
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
  const { createEmployee } = employeeUseCases(orm);

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

test("creation records each populated field in a history line", async ({ orm }) => {
  const employees = employeeUseCases(orm);

  const employee = await employees.createEmployee(OWNER, {
    firstName: "  Avery  ",
    lastName: "Stone",
    email: "AVERY@EXAMPLE.COM",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  });
  assert(employee);

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "CREATED",
    author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: null,
    changes: [
      { field: "firstName", oldValue: null, newValue: "Avery" },
      { field: "lastName", oldValue: null, newValue: "Stone" },
      { field: "email", oldValue: null, newValue: "avery@example.com" },
      { field: "jobTitle", oldValue: null, newValue: "Engineer" },
      { field: "startDate", oldValue: null, newValue: "2026-02-28" },
    ],
  });
  await expectHistoryReplaysTo(orm, employee.id);
});
