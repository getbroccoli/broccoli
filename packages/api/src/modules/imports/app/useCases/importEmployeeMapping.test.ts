import { expect, it } from "vitest";

import type { ImportEmployee } from "../../domain";
import { incompleteReason, toNewEmployee } from "./importEmployeeMapping";

const record: ImportEmployee = {
  id: "employee-1",
  sourceId: "source-1",
  firstName: "  Avery  ",
  lastName: "  Stone  ",
  email: "  Avery@EXAMPLE.COM  ",
  jobTitle: "  Designer  ",
  startDate: null,
};

it("returns the normalised employee and no incomplete reason for a complete record", () => {
  expect(toNewEmployee(record)).toEqual({
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Designer",
    startDate: null,
  });
  expect(incompleteReason(record)).toBeNull();
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
])("leaves out a record with $description and reports $reason", ({ values, reason }) => {
  const incomplete = { ...record, ...values };

  expect(toNewEmployee(incomplete)).toBeNull();
  expect(incompleteReason(incomplete)).toBe(reason);
});

it("reports the missing last name before the missing email", () => {
  expect(incompleteReason({ ...record, lastName: null, email: null })).toBe("lastName");
});
