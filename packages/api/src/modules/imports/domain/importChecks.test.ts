import { expect, it } from "vitest";

import {
  type CheckFilter,
  groupEmployeeRecords,
  type ImportEmployeeRecord,
  type ImportSource,
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

  expect(listChecks([file, slack], employees)).toEqual([
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

  expect(listChecks([file], employees)).toEqual([
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

  expect(listChecks([file, slack], employees).map(({ id }) => id)).toEqual([
    "conflict:firstName",
    "conflict:jobTitle",
    "incomplete:firstName",
    "incomplete:lastName",
    "incomplete:email",
    "incomplete:other",
  ]);
});

it("lists only sources holding conflicting values, with files before Slack", () => {
  const newer = { ...file, id: "newer", name: "newer.csv" };
  const empty = { ...file, id: "empty", name: "empty.csv" };
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

  expect(listChecks(sources, employees)).toEqual([
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

  expect(listChecks([file, slack], employees)).toEqual([]);
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

  expect(listChecks([file, slack], employees)).toEqual([]);
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

  expect(isInCheck(employee!, check)).toBe(false);
});

const file: ImportSource = {
  id: "file",
  kind: "file",
  name: "staff.csv",
  readAt: new Date("2026-10-01"),
  status: "mapped",
  failure: null,
  failureMessage: null,
};
const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
const row: ImportEmployeeRecord = {
  id: "row",
  sourceId: file.id,
  firstName: "Avery",
  lastName: "Stone",
  email: "avery@example.com",
  jobTitle: "Designer",
  startDate: null,
  photoFileId: null,
};
const member: ImportEmployeeRecord = {
  ...row,
  id: "member",
  sourceId: slack.id,
  jobTitle: "Engineer",
};
