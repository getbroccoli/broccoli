import { assert } from "vitest";

import { employeeUseCases, expect, expectHistoryReplaysTo, OWNER, test } from "#test/support";

test("parallel job title edits keep their old and new values chained", async ({ orm }) => {
  const employees = employeeUseCases(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
  });
  assert(employee);

  await Promise.all([
    employees.updateEmployee(OWNER, { id: employee.id, jobTitle: "Lead" }),
    employees.updateEmployee(OWNER, { id: employee.id, jobTitle: "Principal" }),
  ]);

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  const updates = edges
    .map(({ node }) => node)
    .filter((line) => line.operation === "UPDATED")
    .reverse();
  expect(updates).toHaveLength(2);
  expect(updates[0]!.changes).toEqual([
    { field: "jobTitle", oldValue: "Engineer", newValue: expect.any(String) as unknown },
  ]);
  expect(updates[1]!.changes).toEqual([
    {
      field: "jobTitle",
      oldValue: updates[0]!.changes[0]!.newValue,
      newValue: expect.any(String) as unknown,
    },
  ]);
  expect(updates.map((line) => line.changes[0]!.newValue).sort()).toEqual(["Lead", "Principal"]);
  await expectHistoryReplaysTo(orm, employee.id);
});

test("an update addressed by uppercase id keeps its history under the canonical id", async ({
  orm,
}) => {
  const employees = employeeUseCases(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
  });
  assert(employee);

  const updated = await employees.updateEmployee(OWNER, {
    id: employee.id.toUpperCase(),
    jobTitle: "Lead",
  });

  expect(updated.employee?.id).toBe(employee.id);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges.map(({ node }) => ({ recordId: node.recordId, operation: node.operation }))).toEqual(
    [
      { recordId: employee.id, operation: "UPDATED" },
      { recordId: employee.id, operation: "CREATED" },
    ],
  );
  await expectHistoryReplaysTo(orm, employee.id);
});
