import { expect, it } from "vitest";

import { changedFields, toUpdateInput, type EmployeeValues } from "./employeeDraft";

it("leaves saved fields unchanged when they are absent from the draft", () => {
  const fields = changedFields(saved, {});

  expect(fields).toEqual([]);
});

it("removes a change when its draft value matches the saved value", () => {
  const fields = changedFields(saved, { firstName: "Avery" });

  expect(fields).toEqual([]);
});

it("treats an empty draft string as the same as a saved null", () => {
  const fields = changedFields(saved, { jobTitle: "" });

  expect(fields).toEqual([]);
});

it("includes clearing a saved value as a change", () => {
  const fields = changedFields(saved, { email: "" });

  expect(fields).toEqual(["email"]);
});

it("returns changed fields in employee field order", () => {
  const fields = changedFields(saved, {
    startDate: "2025-01-06",
    jobTitle: "Designer",
    email: "avery.chen@example.com",
    lastName: "Chen",
    firstName: "Robin",
  });

  expect(fields).toEqual(["firstName", "lastName", "email", "jobTitle", "startDate"]);
});

it("sends the id and only fields that changed", () => {
  const input = toUpdateInput(
    "employee-1",
    saved,
    { firstName: "Avery", jobTitle: "Designer" },
    "",
  );

  expect(input).toStrictEqual({ id: "employee-1", jobTitle: "Designer" });
});

it("sends a cleared field as null", () => {
  const input = toUpdateInput("employee-1", saved, { email: "" }, "");

  expect(input).toStrictEqual({ id: "employee-1", email: null });
});

it("sends a changed manager as managerId", () => {
  const input = toUpdateInput("employee-1", saved, { manager: "employee-2" }, "");

  expect(input).toStrictEqual({ id: "employee-1", managerId: "employee-2" });
});

it("sends a cleared manager as a null managerId", () => {
  const input = toUpdateInput(
    "employee-1",
    { ...saved, manager: "employee-2" },
    { manager: "" },
    "",
  );

  expect(input).toStrictEqual({ id: "employee-1", managerId: null });
});

it("tracks changed permission profiles without sending them in the employee update", () => {
  const draft = { permissionProfiles: "EMPLOYEE,ADMIN" };

  const fields = changedFields(saved, draft);
  const input = toUpdateInput("employee-1", saved, draft, "");

  expect(fields).toEqual(["permissionProfiles"]);
  expect(input).toStrictEqual({ id: "employee-1" });
});

it("trims the change reason before sending it", () => {
  const input = toUpdateInput("employee-1", saved, { jobTitle: "Designer" }, "  New role  ");

  expect(input).toStrictEqual({ id: "employee-1", jobTitle: "Designer", changeReason: "New role" });
});

it("omits a blank change reason", () => {
  const input = toUpdateInput("employee-1", saved, { jobTitle: "Designer" }, "  \n ");

  expect(input).toStrictEqual({ id: "employee-1", jobTitle: "Designer" });
});

const saved: EmployeeValues = {
  firstName: "Avery",
  lastName: "Morgan",
  email: "avery@example.com",
  jobTitle: null,
  manager: null,
  startDate: null,
  permissionProfiles: null,
};
