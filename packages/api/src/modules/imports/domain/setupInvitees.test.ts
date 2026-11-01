import { expect, it } from "vitest";

import { groupEmployeeRecords, type ImportEmployeeRecord } from "./importEmployee";
import { type ImportManager } from "./importManagers";
import { ImportSource } from "./importSource";
import { setupInvitees } from "./setupInvitees";

it("invites nobody when only admins are chosen", () => {
  expect(setupInvitees(people, managers, "only_admins", null, null)).toEqual([]);
});

it("invites every ready person except the owner when everyone is chosen", () => {
  expect(setupInvitees(people, managers, "everyone", "avery@example.com", null)).toEqual([
    robin,
    taylor,
    casey,
  ]);
});

it("invites managers in review order except the owner when admins and managers are chosen", () => {
  expect(setupInvitees(people, managers, "admins_and_managers", "avery@example.com", null)).toEqual(
    [robin, taylor],
  );
});

it("admins and managers leaves out someone whose only reports are not being added", () => {
  const managers = new Map<string, ImportManager>([
    ["leftout@example.com", { manager: robin!, problem: null }],
  ]);

  expect(setupInvitees(people, managers, "admins_and_managers", null, null)).toEqual([]);
});

it("never invites the person whose work email is the owner's sign-in email", () => {
  expect(setupInvitees(people, managers, "everyone", null, "Robin@Example.com")).toEqual([
    avery,
    taylor,
    casey,
  ]);
});

const file = new ImportSource({
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
});
const record: ImportEmployeeRecord = {
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
const people = groupEmployeeRecords(
  [file],
  [
    record,
    { ...record, id: "robin", email: "robin@example.com" },
    { ...record, id: "taylor", email: "taylor@example.com" },
    { ...record, id: "casey", email: "casey@example.com" },
  ],
  [],
);
const [avery, robin, taylor, casey] = people;
const managers = new Map<string, ImportManager>([
  [robin!.key, { manager: taylor!, problem: null }],
  [casey!.key, { manager: robin!, problem: null }],
  [taylor!.key, { manager: avery!, problem: null }],
  [avery!.key, { manager: null, problem: null }],
]);
