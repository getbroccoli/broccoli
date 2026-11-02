import { expect, it } from "vitest";

import { matchManagers } from "./importManagers";

import {
  type CheckFilter,
  groupEmployeeRecords,
  type ImportEmployeeRecord,
  ImportSource,
  isInCheck,
  listChecks,
  parseCheckId,
  type ValueChoice,
} from ".";

it("counts import employees for each conflict kind", () => {
  const robin = { ...row, id: "robin", email: "robin@example.com" };
  const employees = groupEmployeeRecords(
    [file, slack],
    [
      row,
      { ...member, firstName: "Ave" },
      robin,
      { ...robin, id: "robin-member", sourceId: slack.id, jobTitle: "Engineer" },
    ],
    [],
  );

  expect(listChecks([file, slack], employees, new Map())).toEqual([
    {
      id: "conflict:firstName",
      kind: "conflict",
      field: "firstName",
      count: 1,
      sourceIds: [file.id, slack.id],
    },
    {
      id: "conflict:jobTitle",
      kind: "conflict",
      field: "jobTitle",
      count: 2,
      sourceIds: [file.id, slack.id],
    },
  ]);
});

it.each([
  { reason: "firstName", values: { firstName: null } },
  { reason: "lastName", values: { lastName: null } },
  { reason: "email", values: { email: null } },
  { reason: "other", values: { jobTitle: "x".repeat(101) } },
])("counts import employees with incomplete $reason", ({ reason, values }) => {
  const employees = groupEmployeeRecords([file], [{ ...row, ...values }], []);

  expect(listChecks([file], employees, new Map())).toEqual([
    { id: `incomplete:${reason}`, kind: "incomplete", reason, count: 1 },
  ]);
});

it("lists conflict kinds before incomplete kinds in field order", () => {
  const employees = groupEmployeeRecords(
    [file, slack],
    [
      row,
      { ...member, firstName: "Ave" },
      { ...row, id: "other", email: "other@example.com", jobTitle: "x".repeat(101) },
      { ...row, id: "email", email: null },
      { ...row, id: "last", email: "last@example.com", lastName: null },
      { ...row, id: "first", email: "first@example.com", firstName: null },
    ],
    [],
  );

  expect(listChecks([file, slack], employees, new Map()).map(({ id }) => id)).toEqual([
    "conflict:firstName",
    "conflict:jobTitle",
    "incomplete:firstName",
    "incomplete:lastName",
    "incomplete:email",
    "incomplete:other",
  ]);
});

it("lists only sources holding conflicting values, with files before Slack", () => {
  const newer = new ImportSource({ ...fileState, id: "newer", name: "newer.csv" });
  const empty = new ImportSource({ ...fileState, id: "empty", name: "empty.csv" });
  const sources = [slack, file, newer, empty];
  const employees = groupEmployeeRecords(
    sources,
    [
      member,
      row,
      { ...row, id: "duplicate" },
      { ...row, id: "newer-row", sourceId: newer.id, jobTitle: "Lead" },
      { ...row, id: "empty-row", sourceId: empty.id, jobTitle: null },
    ],
    [],
  );

  expect(listChecks(sources, employees, new Map())).toEqual([
    {
      id: "conflict:jobTitle",
      kind: "conflict",
      field: "jobTitle",
      count: 1,
      sourceIds: [file.id, newer.id, slack.id],
    },
  ]);
});

it.each<{ description: string; choice: ValueChoice }>([
  { description: "picked", choice: { recordId: "member" } },
  { description: "typed", choice: { value: "Lead" } },
])("does not count a conflict settled by a $description value", ({ choice }) => {
  const employees = groupEmployeeRecords(
    [file, slack],
    [row, member],
    [{ key: row.email!, leftOut: false, values: { jobTitle: choice } }],
  );

  expect(listChecks([file, slack], employees, new Map())).toEqual([]);
});

it("does not count a left-out employee's conflicts or incomplete values", () => {
  const employees = groupEmployeeRecords(
    [file, slack],
    [
      { ...row, lastName: null },
      { ...member, lastName: null },
    ],
    [{ key: row.email!, leftOut: true, values: {} }],
  );

  expect(listChecks([file, slack], employees, new Map())).toEqual([]);
});

it("excludes a manager conflict settled by choosing a person from counts and filters", () => {
  const employees = groupEmployeeRecords(
    [file, slack],
    [
      { ...row, manager: "Robin Reed" },
      { ...row, id: member.id, sourceId: slack.id, manager: "Taylor Brook" },
      { ...row, id: "robin", email: "robin@example.com" },
    ],
    [
      {
        key: row.email!,
        leftOut: false,
        values: {},
        chosenManager: { employeeKey: "robin@example.com" },
      },
    ],
  );
  const check = parseCheckId("conflict:manager");

  expect(listChecks([file, slack], employees, new Map())).toEqual([]);
  expect(employees.filter((employee) => isInCheck(employee, check, new Map()))).toEqual([]);
});

it("excludes a manager conflict settled by choosing no manager from counts and filters", () => {
  const employees = groupEmployeeRecords(
    [file, slack],
    [
      { ...row, manager: "Robin Reed" },
      { ...row, id: member.id, sourceId: slack.id, manager: "Taylor Brook" },
    ],
    [{ key: row.email!, leftOut: false, values: {}, chosenManager: { noManager: true } }],
  );
  const check = parseCheckId("conflict:manager");

  expect(listChecks([file, slack], employees, new Map())).toEqual([]);
  expect(employees.filter((employee) => isInCheck(employee, check, new Map()))).toEqual([]);
});

it("parses a conflict check id", () => {
  expect(parseCheckId("conflict:jobTitle")).toEqual({ kind: "conflict", field: "jobTitle" });
});

it("parses an incomplete check id", () => {
  expect(parseCheckId("incomplete:email")).toEqual({ kind: "incomplete", reason: "email" });
});

it("parses an unknown check id as no check", () => {
  expect(parseCheckId("unknown")).toEqual({ kind: "none" });
});

it.each<CheckFilter>([
  { kind: "conflict", field: "jobTitle" },
  { kind: "incomplete", reason: "lastName" },
  { kind: "none" },
])("excludes a left-out employee from a $kind check", (check) => {
  const [employee] = groupEmployeeRecords(
    [file, slack],
    [
      { ...row, lastName: null },
      { ...member, lastName: null },
    ],
    [{ key: row.email!, leftOut: true, values: {} }],
  );

  expect(isInCheck(employee!, check, new Map())).toBe(false);
});

it("counts manager problems without people who are left out", () => {
  const employees = groupEmployeeRecords(
    [file],
    [
      { ...row, manager: "Missing Person" },
      { ...row, id: "other", email: "other@example.com", manager: "Missing Person" },
    ],
    [{ key: "other@example.com", leftOut: true, values: {} }],
  );
  const managers = matchManagers(
    employees,
    employees.filter(({ leftOut }) => !leftOut),
  );

  expect(listChecks([file], employees, managers)).toEqual([
    { id: "manager:noPersonMatches", kind: "manager", problem: "noPersonMatches", count: 1 },
  ]);
});

it("parses a manager check ID", () => {
  expect(parseCheckId("manager:noPersonMatches")).toEqual({
    kind: "manager",
    problem: "noPersonMatches",
  });
});

it("includes only people with the requested manager problem who are not left out", () => {
  const employees = groupEmployeeRecords(
    [file],
    [
      { ...row, manager: "Missing Person" },
      { ...row, id: "other", email: "other@example.com", manager: "Missing Person" },
      { ...row, id: "ready", email: "ready@example.com" },
    ],
    [{ key: "other@example.com", leftOut: true, values: {} }],
  );
  const managers = matchManagers(
    employees,
    employees.filter(({ leftOut }) => !leftOut),
  );
  const check = parseCheckId("manager:noPersonMatches");

  expect(
    employees.filter((employee) => isInCheck(employee, check, managers)).map(({ key }) => key),
  ).toEqual([row.email]);
});

const fileState = {
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
const file = new ImportSource(fileState);
const slack = new ImportSource({ ...fileState, id: "slack", kind: "slack", name: "Workspace" });
const row: ImportEmployeeRecord = {
  id: "row",
  sourceId: file.id,
  firstName: "Avery",
  lastName: "Stone",
  email: "avery@example.com",
  jobTitle: "Designer",
  location: null,
  manager: null,
  externalRecordId: null,
  startDate: null,
  photoFileId: null,
};
const member: ImportEmployeeRecord = {
  ...row,
  id: "member",
  sourceId: slack.id,
  jobTitle: "Engineer",
};
