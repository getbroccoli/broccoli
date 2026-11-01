import { expect, it } from "vitest";

import { groupEmployeeRecords, type ImportEmployeeRecord } from "./importEmployee";
import { matchManagers } from "./importManagers";
import { ImportSource } from "./importSource";

it("matches a manager by email", () => {
  const employees = groupEmployeeRecords([file], [{ ...avery, manager: robin.email }, robin], []);

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: employees[1],
    problem: null,
  });
  expect(matchManagers(employees, employees).get(robin.email!)).toEqual({
    manager: null,
    problem: null,
  });
});

it("matches a manager by name ignoring case and runs of spaces", () => {
  const employees = groupEmployeeRecords(
    [file],
    [{ ...avery, manager: "  ROBIN   reed  " }, robin],
    [],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: employees[1],
    problem: null,
  });
});

it("matches a manager written Family, Given", () => {
  const employees = groupEmployeeRecords([file], [{ ...avery, manager: "Reed, Robin" }, robin], []);

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: employees[1],
    problem: null,
  });
});

it("matches a manager by the source's own ID", () => {
  const employees = groupEmployeeRecords(
    [file],
    [
      { ...avery, manager: "EMP-2" },
      { ...robin, externalRecordId: "EMP-2" },
    ],
    [],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: employees[1],
    problem: null,
  });
});

it("does not match an ID from another source", () => {
  const other = new ImportSource({ ...source, id: "other" });
  const employees = groupEmployeeRecords(
    [file, other],
    [
      { ...avery, manager: "EMP-2" },
      { ...robin, sourceId: other.id, externalRecordId: "EMP-2" },
    ],
    [],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: null,
    problem: "noPersonMatches",
  });
});

it("reports a name shared by several people", () => {
  const employees = groupEmployeeRecords(
    [file],
    [
      { ...avery, manager: "Robin Reed" },
      robin,
      { ...robin, id: "other", email: "other@example.com" },
    ],
    [],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: null,
    problem: "severalPeopleMatch",
  });
});

it("reports a manager who matches nobody", () => {
  const employees = groupEmployeeRecords(
    [file],
    [{ ...avery, manager: "Taylor Brook" }, robin],
    [],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: null,
    problem: "noPersonMatches",
  });
});

it("does not match a manager who is left out", () => {
  const employees = groupEmployeeRecords(
    [file],
    [{ ...avery, manager: robin.email }, robin],
    [{ key: robin.email!, leftOut: true, values: {} }],
  );
  const addable = employees.filter(({ leftOut }) => !leftOut);

  expect(matchManagers(employees, addable).get(avery.email!)).toEqual({
    manager: null,
    problem: "noPersonMatches",
  });
});

it("does not match a reference to oneself", () => {
  const employees = groupEmployeeRecords([file], [{ ...avery, manager: avery.email }], []);

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: null,
    problem: "noPersonMatches",
  });
});

it("marks everyone in a loop while keeping a manager for someone reporting into it", () => {
  const employees = groupEmployeeRecords(
    [file],
    [
      { ...avery, manager: robin.email },
      { ...robin, manager: avery.email },
      { ...avery, id: "taylor", email: "taylor@example.com", manager: avery.email },
    ],
    [],
  );

  const managers = matchManagers(employees, employees);

  expect(managers.get(avery.email!)).toEqual({ manager: null, problem: "managersFormALoop" });
  expect(managers.get(robin.email!)).toEqual({ manager: null, problem: "managersFormALoop" });
  expect(managers.get("taylor@example.com")).toEqual({ manager: employees[0], problem: null });
});

it("uses the chosen person ahead of the source's reference", () => {
  const employees = groupEmployeeRecords(
    [file],
    [{ ...avery, manager: "Missing Person" }, robin],
    [
      {
        key: avery.email!,
        leftOut: false,
        values: {},
        chosenManager: { employeeKey: robin.email! },
      },
    ],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: employees[1],
    problem: null,
  });
});

it("finds a chosen manager through a merged key", () => {
  const employees = groupEmployeeRecords(
    [file],
    [avery, robin, { ...robin, id: "old", email: "old@example.com" }],
    [
      {
        key: avery.email!,
        leftOut: false,
        values: {},
        chosenManager: { employeeKey: "old@example.com" },
      },
      { key: "old@example.com", leftOut: false, values: { email: { value: robin.email! } } },
    ],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: employees[1],
    problem: null,
  });
});

it("keeps no manager and no problem after choosing no manager", () => {
  const employees = groupEmployeeRecords(
    [file],
    [{ ...avery, manager: "Missing Person" }],
    [{ key: avery.email!, leftOut: false, values: {}, chosenManager: { noManager: true } }],
  );

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: null,
    problem: null,
  });
});

it("does not match a first name alone", () => {
  const employees = groupEmployeeRecords([file], [{ ...avery, manager: "Robin" }, robin], []);

  expect(matchManagers(employees, employees).get(avery.email!)).toEqual({
    manager: null,
    problem: "noPersonMatches",
  });
});

const source = {
  id: "file",
  kind: "file",
  name: "staff.csv",
  readAt: new Date("2026-10-01"),
  status: "mapped",
  failure: null,
  failureMessage: null,
  readBy: "parsed_by_broccoli",
  pickedUpByExternalAgentAt: null,
  externalAgentProgress: null,
  originalReadAllowedAt: null,
  originalReadAiSource: null,
} as const;
const file = new ImportSource(source);
const avery: ImportEmployeeRecord = {
  id: "avery",
  sourceId: file.id,
  firstName: "Avery",
  lastName: "Stone",
  email: "avery@example.com",
  jobTitle: null,
  manager: null,
  externalRecordId: null,
  startDate: null,
  photoFileId: null,
};
const robin: ImportEmployeeRecord = {
  ...avery,
  id: "robin",
  firstName: "Robin",
  lastName: "Reed",
  email: "robin@example.com",
};
