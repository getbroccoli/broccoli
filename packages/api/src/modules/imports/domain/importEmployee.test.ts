import { expect, it } from "vitest";

import {
  groupEmployeeRecords,
  hasOpenConflict,
  type ImportEmployeeRecord,
  type ImportSource,
} from ".";

it("groups a Slack member and a file row with one email into one import employee", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const employees = groupEmployeeRecords([slack, file], [member, row], []);

  expect(employees).toHaveLength(1);
  expect(employees[0]).toMatchObject({
    key: row.email,
    keys: [row.email],
    records: [row, member],
    leftOut: false,
  });
});

it("keeps each record without an email alone", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };

  const first = { ...row, email: null };
  const second = { ...first, id: "second" };

  const employees = groupEmployeeRecords([file], [first, second], []);

  expect(employees.map(({ key, records }) => ({ key, records }))).toEqual([
    { key: "record:row", records: [first] },
    { key: "record:second", records: [second] },
  ]);
});

it("groups two rows of one file with one email", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };

  const duplicate = { ...row, id: "duplicate" };

  const employees = groupEmployeeRecords([file], [row, duplicate], []);

  expect(employees).toHaveLength(1);
  expect(employees[0]!.records).toEqual([row, duplicate]);
  expect(employees[0]!.values.jobTitle.options).toEqual([
    { value: "Designer", recordIds: [row.id, duplicate.id] },
  ]);
});

it("defaults to the older file before the newer file and Slack", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const newer = { ...file, id: "newer", name: "newer.csv" };
  const newerRow = { ...row, id: "newer-row", sourceId: newer.id, jobTitle: "Manager" };

  const [employee] = groupEmployeeRecords([slack, file, newer], [member, row, newerRow], []);

  expect(employee!.values.jobTitle.value).toBe("Designer");
  expect(employee!.records).toEqual([row, newerRow, member]);
});

it("shows a value from only one source without a conflict", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const [employee] = groupEmployeeRecords([file, slack], [{ ...row, jobTitle: null }, member], []);

  expect(employee!.values.jobTitle).toEqual({
    value: "Engineer",
    choice: "default",
    pickedRecordId: null,
    options: [{ value: "Engineer", recordIds: [member.id] }],
  });
  expect(hasOpenConflict(employee!.values.jobTitle)).toBe(false);
});

it("shows the default and both record options for an open conflict", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const [employee] = groupEmployeeRecords([slack, file], [member, row], []);

  expect(employee!.values.jobTitle).toEqual({
    value: "Designer",
    choice: "default",
    pickedRecordId: null,
    options: [
      { value: "Designer", recordIds: [row.id] },
      { value: "Engineer", recordIds: [member.id] },
    ],
  });
  expect(hasOpenConflict(employee!.values.jobTitle)).toBe(true);
});

it("reports the picked record id with its value and settles the conflict", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const [employee] = groupEmployeeRecords(
    [file, slack],
    [row, member],
    [{ key: row.email!, leftOut: false, values: { jobTitle: { recordId: member.id } } }],
  );

  expect(employee!.values.jobTitle).toMatchObject({
    value: "Engineer",
    choice: "picked",
    pickedRecordId: member.id,
  });
  expect(hasOpenConflict(employee!.values.jobTitle)).toBe(false);
});

it("falls back to the default when a picked record is outside the group", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const outsider = { ...member, id: "outsider", email: "robin@example.com" };

  const [employee] = groupEmployeeRecords(
    [file, slack],
    [row, member, outsider],
    [{ key: row.email!, leftOut: false, values: { jobTitle: { recordId: outsider.id } } }],
  );

  expect(employee!.values.jobTitle).toMatchObject({
    value: "Designer",
    choice: "default",
    pickedRecordId: null,
  });
  expect(hasOpenConflict(employee!.values.jobTitle)).toBe(true);
});

it("shows a typed value and settles the conflict", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const [employee] = groupEmployeeRecords(
    [file, slack],
    [row, member],
    [{ key: row.email!, leftOut: false, values: { jobTitle: { value: "Lead" } } }],
  );

  expect(employee!.values.jobTitle).toMatchObject({
    value: "Lead",
    choice: "typed",
    pickedRecordId: null,
  });
  expect(hasOpenConflict(employee!.values.jobTitle)).toBe(false);
});

it("merges a typed email with the target’s key first and its choices kept", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };
  const slack: ImportSource = { ...file, id: "slack", kind: "slack", name: "Workspace" };
  const member = { ...row, id: "member", sourceId: slack.id, jobTitle: "Engineer" };

  const other = { ...member, email: "other@example.com" };

  const employees = groupEmployeeRecords(
    [file, slack],
    [row, other],
    [
      {
        key: other.email,
        leftOut: false,
        values: {
          email: { value: row.email! },
          firstName: { value: "Robin" },
          jobTitle: { value: "Lead" },
        },
      },
      { key: row.email!, leftOut: false, values: { jobTitle: { value: "Director" } } },
    ],
  );

  expect(employees).toHaveLength(1);
  expect(employees[0]).toMatchObject({
    key: row.email,
    keys: [row.email, other.email],
    records: [row, other],
    values: {
      email: { value: row.email },
      firstName: { value: "Robin", choice: "typed" },
      jobTitle: { value: "Director", choice: "typed" },
    },
  });
});

it("keeps the left-out choice on the import employee", () => {
  const file: ImportSource = { ...mapped, id: "file", kind: "file", name: "staff.csv" };

  const [employee] = groupEmployeeRecords(
    [file],
    [row],
    [{ key: row.email!, leftOut: true, values: {} }],
  );

  expect(employee!.leftOut).toBe(true);
});

it("uses the first record's photo that has one", () => {
  const slack: ImportSource = { ...mapped, id: "slack", kind: "slack", name: "Workspace" };
  const withoutPhoto = { ...row, sourceId: slack.id };
  const firstPhoto = { ...withoutPhoto, id: "first-photo", photoFileId: "first-file" };
  const laterPhoto = { ...withoutPhoto, id: "later-photo", photoFileId: "later-file" };

  const [employee] = groupEmployeeRecords([slack], [withoutPhoto, firstPhoto, laterPhoto], []);

  expect(employee!.photoFileId).toBe(firstPhoto.photoFileId);
});

const mapped = {
  readAt: new Date("2026-10-01"),
  status: "mapped",
  failure: null,
  failureMessage: null,
  readBy: "parsed_by_broccoli",
  pickedUpByExternalAgentAt: null,
  originalReadAllowedAt: null,
  originalReadAiSource: null,
} as const;

const row: ImportEmployeeRecord = {
  id: "row",
  sourceId: "file",
  firstName: "Avery",
  lastName: "Stone",
  email: "avery@example.com",
  jobTitle: "Designer",
  startDate: null,
  photoFileId: null,
};
