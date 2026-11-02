import { expect, it } from "vitest";

import { parseImportEmployeeValues } from "./importEmployeeJson";

it("reads version one employee values", () => {
  const values = {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Designer",
    startDate: "2026-10-01",
    location: "Leeds",
  };

  expect(parseImportEmployeeValues(1, values)).toEqual({ ...values, manager: null });
});

it("refuses an unknown employee values version", () => {
  const values = { firstName: null, lastName: null, email: null, jobTitle: null, startDate: null };

  expect(() => parseImportEmployeeValues(2, values)).toThrow();
});
