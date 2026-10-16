import { expect, it } from "vitest";

import type { ImportEmployee } from "../../domain";
import { incompleteReason, toNewEmployee } from "./importEmployeeMapping";

it("returns the normalised employee and no incomplete reason for a complete import employee", () => {
  expect(toNewEmployee(employee())).toEqual({
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Designer",
    startDate: null,
  });
  expect(incompleteReason(employee())).toBeNull();
});

it.each([
  { description: "no first name", values: { firstName: null }, reason: "firstName" },
  { description: "no last name", values: { lastName: null }, reason: "lastName" },
  { description: "no email", values: { email: null }, reason: "email" },
  { description: "an invalid email", values: { email: "avery@" }, reason: "email" },
  {
    description: "a job title over 100 characters",
    values: { jobTitle: "a".repeat(101) },
    reason: "other",
  },
])("leaves out an import employee with $description and reports $reason", ({ values, reason }) => {
  const incomplete = employee(values);

  expect(toNewEmployee(incomplete)).toBeNull();
  expect(incompleteReason(incomplete)).toBe(reason);
});

it("reports the missing last name before the missing email", () => {
  expect(incompleteReason(employee({ lastName: null, email: null }))).toBe("lastName");
});

function employee(
  overrides: Partial<Record<keyof ImportEmployee["values"], string | null>> = {},
): ImportEmployee {
  const shown = {
    firstName: "  Avery  ",
    lastName: "  Stone  ",
    email: "  Avery@EXAMPLE.COM  ",
    jobTitle: "  Designer  ",
    startDate: null,
    ...overrides,
  };
  return {
    key: "avery@example.com",
    records: [],
    leftOut: false,
    values: {
      firstName: { value: shown.firstName, choice: "typed", options: [] },
      lastName: { value: shown.lastName, choice: "typed", options: [] },
      email: { value: shown.email, choice: "typed", options: [] },
      jobTitle: { value: shown.jobTitle, choice: "typed", options: [] },
      startDate: { value: shown.startDate, choice: "typed", options: [] },
    },
  };
}
