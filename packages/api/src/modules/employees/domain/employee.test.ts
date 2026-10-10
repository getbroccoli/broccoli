import { expect, it } from "vitest";

import { parseNewEmployee } from "./employee";

const input = { firstName: "Employee", lastName: "One", email: "employee1@example.com" };

it("trims names and lowercases the email", () => {
  const employee = parseNewEmployee({
    firstName: "  Employee  ",
    lastName: "  One  ",
    email: "  Employee1@EXAMPLE.COM  ",
  });

  expect(employee).toEqual({ ...input, jobTitle: null, startDate: null });
});

it("turns a blank job title into null", () => {
  const employee = parseNewEmployee({ ...input, jobTitle: "   " });

  expect(employee.jobTitle).toBeNull();
});

it("rejects a blank first name", () => {
  expect(() => parseNewEmployee({ ...input, firstName: "   " })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "firstName", code: "required" }],
    }),
  );
});

it("rejects a malformed email", () => {
  expect(() => parseNewEmployee({ ...input, email: "not-an-email" })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "email", code: "invalid" }],
    }),
  );
});

it("rejects an email longer than 254 characters", () => {
  const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(58)}.com`;

  expect(() => parseNewEmployee({ ...input, email })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "email", code: "too_long" }],
    }),
  );
});

it("rejects an impossible start date", () => {
  expect(() => parseNewEmployee({ ...input, startDate: "2026-02-30" })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "startDate", code: "invalid" }],
    }),
  );
});
