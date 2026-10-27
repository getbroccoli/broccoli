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

test("removing a manager clears them from every report with a history line", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const avery = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const taylor = await seed.employee({ firstName: "Taylor", lastName: "Brook" });
  const employees = employeeUseCases(orm);
  for (const report of [avery, taylor]) {
    await employees.updateEmployee(OWNER, { id: report.id, managerId: manager.id });
  }

  const { reportHistoryLines } = await employees.deleteEmployee(OWNER, {
    id: manager.id,
    changeReason: "Left the company",
  });

  expect(await employees.readEmployee(OWNER, manager.id)).toBeNull();
  expect(reportHistoryLines).toHaveLength(2);
  for (const report of [avery, taylor]) {
    expect((await employees.readManagers(OWNER, [report.id])).has(report.id)).toBe(false);
    const { edges } = await employees.readEmployeeHistory(OWNER, report.id, {});
    expect(edges).toHaveLength(2);
    expect(reportHistoryLines).toContainEqual(edges[0]!.node);
    expect(edges[0]!.node).toMatchObject({
      recordType: "employee",
      recordId: report.id,
      operation: "UPDATED",
      cause: { kind: "MANAGER_REMOVED", ref: manager.id },
      reason: null,
      changes: [{ field: "manager", oldValue: "Robin Reed", newValue: null }],
    });
  }
  const { edges } = await employees.readEmployeeHistory(OWNER, manager.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toMatchObject({
    operation: "DELETED",
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: "Left the company",
  });
});

test("a removed person's deletion line keeps their manager", async ({ orm, seed }) => {
  const employee = await seed.employee({
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const employees = employeeUseCases(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, managerId: manager.id });

  await employees.deleteEmployee(OWNER, { id: employee.id });

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges[0]!.node).toMatchObject({
    operation: "DELETED",
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    changes: [
      { field: "firstName", oldValue: "Avery", newValue: null },
      { field: "lastName", oldValue: "Stone", newValue: null },
      { field: "email", oldValue: "avery@example.com", newValue: null },
      { field: "jobTitle", oldValue: "Engineer", newValue: null },
      { field: "startDate", oldValue: "2026-02-28", newValue: null },
      { field: "manager", oldValue: "Robin Reed", newValue: null },
    ],
  });
});

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

  const deleted = await employeeUseCases(orm, {
    transact: transactWithEvents,
  }).deleteEmployee(OWNER, { id: employee.id, changeReason: "  Left  " });

  expect(deleted).toEqual({ deletedEmployeeId: employee.id, reportHistoryLines: [] });
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

  const deleted = await employees.deleteEmployee(OWNER, { id: employee.id.toUpperCase() });

  expect(deleted).toEqual({ deletedEmployeeId: employee.id, reportHistoryLines: [] });
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
