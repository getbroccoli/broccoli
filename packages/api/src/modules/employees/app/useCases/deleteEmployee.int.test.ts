import {
  recordChangedEvents,
  employeeUseCases,
  expect,
  expectHistoryReplaysTo,
  OWNER,
  PNG,
  storedFileIds,
  test,
} from "#test/support";

import { createDemoEmployees } from "..";

test("deletes the employee and avatar while keeping a history of their removed values", async ({
  orm,
  transact,
}) => {
  const input = {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  };
  await transact((tx) =>
    createDemoEmployees(
      OWNER,
      tx,
      [{ employee: input, avatar: { bytes: PNG, mimeType: "image/png" } }],
      { kind: "ADDED_WITH_DEMO" },
    ),
  );
  const employees = employeeUseCases(orm);
  const employee = (await employees.listEmployees(OWNER, {})).edges[0]!.node;
  const before = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(await storedFileIds(orm)).toEqual([employee.avatarFileId]);

  const { transact: transactWithEvents, events } = recordChangedEvents(orm);

  const deletedId = await employeeUseCases(orm, {
    transact: transactWithEvents,
  }).deleteEmployee(OWNER, { id: employee.id, changeReason: "  Left  " });

  expect(deletedId).toBe(employee.id);
  expect(await employees.readEmployee(OWNER, employee.id)).toBeNull();
  expect(await storedFileIds(orm)).toEqual([]);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges.slice(1)).toEqual(before.edges);
  expect(edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "DELETED",
    author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: "Left",
    changes: [
      { field: "firstName", oldValue: "Avery", newValue: null },
      { field: "lastName", oldValue: "Stone", newValue: null },
      { field: "email", oldValue: "avery@example.com", newValue: null },
      { field: "jobTitle", oldValue: "Engineer", newValue: null },
      { field: "startDate", oldValue: "2026-02-28", newValue: null },
    ],
  });
  expect(events).toEqual([
    {
      historyId: edges[0]!.node.id,
      recordType: "employee",
      recordId: employee.id,
      operation: "DELETED",
      fields: ["firstName", "lastName", "email", "jobTitle", "startDate"],
      causeKind: "EDITED_DIRECTLY",
      causeRef: null,
    },
  ]);
  await expectHistoryReplaysTo(orm, employee.id);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-a-uuid"])(
  "refuses deletion of unknown id %s",
  async (id, { orm }) => {
    await expect(employeeUseCases(orm).deleteEmployee(OWNER, { id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No employee has this id.",
    });
  },
);

test("a deletion addressed by uppercase id keeps its history under the canonical id", async ({
  orm,
}) => {
  const employees = employeeUseCases(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });

  const deletedId = await employees.deleteEmployee(OWNER, { id: employee.id.toUpperCase() });

  expect(deletedId).toBe(employee.id);
  expect(await employees.readEmployee(OWNER, employee.id)).toBeNull();
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges.map(({ node }) => ({ recordId: node.recordId, operation: node.operation }))).toEqual(
    [
      { recordId: employee.id, operation: "DELETED" },
      { recordId: employee.id, operation: "CREATED" },
    ],
  );
  await expectHistoryReplaysTo(orm, employee.id);
});
