import { sql } from "drizzle-orm";
import { assert } from "vitest";

import {
  recordChangedEvents,
  employeeUseCases,
  expect,
  expectBlockedBy,
  expectHistoryReplaysTo,
  OWNER,
  test,
} from "#test/support";

import { ormOf } from "../../../../core/db";
import { addDays, todayInUtc } from "../../../../utils";
import { employeeRepository, employmentRepository } from "../../db";

test("saves a manager with other fields in one history line", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await seed.employee({ firstName: "Robin", lastName: "Reed" });
  const { transact, events } = recordChangedEvents(orm);
  const employees = employeeUseCases(orm, { transact });

  const updated = await employees.updateEmployee(OWNER, {
    id: employee.id,
    firstName: "Taylor",
    managerId: manager.id,
  });

  expect((await employees.readManagers(OWNER, [employee.id])).get(employee.id)).toEqual(manager);
  expect((await employees.readEmployee(OWNER, employee.id))?.firstName).toBe("Taylor");
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(updated.historyLine).toEqual(edges[0]!.node);
  expect(updated.historyLine).toMatchObject({
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: null,
    changes: [
      { field: "firstName", oldValue: "Avery", newValue: "Taylor" },
      {
        field: "manager",
        oldValue: null,
        newValue: manager.id,
        oldLabel: null,
        newLabel: "Robin Reed",
      },
    ],
  });
  expect(events).toEqual([
    {
      historyId: updated.historyLine!.id,
      recordType: "employee",
      recordId: employee.id,
      operation: "UPDATED",
      fields: ["firstName", "manager"],
      causeKind: "EDITED_DIRECTLY",
      causeRef: null,
    },
  ]);
});

test("changes only sent fields and records their old and normalised new values", async ({
  orm,
}) => {
  const employees = employeeUseCases(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  });
  assert(employee);

  const { transact, events } = recordChangedEvents(orm);

  const updated = await employeeUseCases(orm, {
    transact,
  }).updateEmployee(OWNER, {
    id: employee.id,
    firstName: "  Robin  ",
    email: "  ROBIN@EXAMPLE.COM  ",
    jobTitle: "  Lead  ",
    changeReason: "  Promoted  ",
  });

  expect(updated.employee).toEqual({
    ...employee,
    firstName: "Robin",
    email: "robin@example.com",
    jobTitle: "Lead",
  });
  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(updated.employee);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    occurredAt: expect.any(Date) as unknown,
    author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: "Promoted",
    changes: [
      { field: "firstName", oldValue: "Avery", newValue: "Robin" },
      { field: "email", oldValue: "avery@example.com", newValue: "robin@example.com" },
      { field: "jobTitle", oldValue: "Engineer", newValue: "Lead" },
    ],
  });
  expect(events).toEqual([
    {
      historyId: edges[0]!.node.id,
      recordType: "employee",
      recordId: employee.id,
      operation: "UPDATED",
      fields: ["firstName", "email", "jobTitle"],
      causeKind: "EDITED_DIRECTLY",
      causeRef: null,
    },
  ]);
  await expectHistoryReplaysTo(orm, employee.id);
});

test("an update returns the history line it appended", async ({ orm, seed }) => {
  const employee = await seed.employee({ jobTitle: "Engineer" });
  const employees = employeeUseCases(orm);

  const { historyLine } = await employees.updateEmployee(OWNER, {
    id: employee.id,
    jobTitle: "Lead",
  });

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(historyLine).toEqual(edges[0]!.node);
});

test.for(["jobTitle", "startDate"] as const)("clears %s when sent null", async (field, { orm }) => {
  const employees = employeeUseCases(orm);
  const input = {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  };
  const employee = await employees.createEmployee(OWNER, input);
  assert(employee);

  await employees.updateEmployee(OWNER, { id: employee.id, [field]: null, changeReason: "  " });

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges[0]!.node).toMatchObject({
    reason: null,
    changes: [{ field, oldValue: input[field], newValue: null }],
  });
  await expectHistoryReplaysTo(orm, employee.id);
});

test("a save with unchanged values records no line and publishes nothing", async ({ orm }) => {
  const { transact, events } = recordChangedEvents(orm);
  const employee = await employeeUseCases(orm).createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
  });
  assert(employee);
  const employees = employeeUseCases(orm, { transact });
  const before = await employees.readEmployeeHistory(OWNER, employee.id, {});

  const updated = await employees.updateEmployee(OWNER, {
    id: employee.id,
    firstName: "  Avery  ",
    email: "AVERY@EXAMPLE.COM",
    jobTitle: "Engineer",
    changeReason: "No change",
  });

  expect(updated.employee).toEqual(employee);
  expect(updated.historyLine).toBeNull();
  expect(await employees.readEmployeeHistory(OWNER, employee.id, {})).toEqual(before);
  expect(events).toEqual([]);
});

test("refuses a taken email without changing the employee or history", async ({ orm, seed }) => {
  await seed.employee({ email: "taken@example.com" });
  const employees = employeeUseCases(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);
  const before = await employees.readEmployeeHistory(OWNER, employee.id, {});

  await expect(
    employees.updateEmployee(OWNER, {
      id: employee.id,
      email: "TAKEN@EXAMPLE.COM",
      jobTitle: "Lead",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "email", code: "taken" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect(await employees.readEmployeeHistory(OWNER, employee.id, {})).toEqual(before);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-a-uuid"])(
  "refuses an update to unknown id %s",
  async (id, { orm }) => {
    await expect(
      employeeUseCases(orm).updateEmployee(OWNER, { id, jobTitle: "Lead" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No employee has this id.",
    });
  },
);

test("refuses a reason longer than 500 characters", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const employees = employeeUseCases(orm);

  await expect(
    employees.updateEmployee(OWNER, {
      id: employee.id,
      jobTitle: "Lead",
      changeReason: "x".repeat(501),
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "changeReason", code: "too_long" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test.for(["firstName", "lastName", "email"] as const)(
  "refuses null for required field %s",
  async (field, { orm, seed }) => {
    const employee = await seed.employee();
    const employees = employeeUseCases(orm);

    await expect(
      employees.updateEmployee(OWNER, { id: employee.id, [field]: null }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field, code: "required" }],
    });

    expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
    expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
  },
);

test("a start date edit that waited for another records the date that one stored", async ({
  orm,
  seed,
  transact,
}) => {
  const startDate = todayInUtc();
  const changedDate = addDays(startDate, 30);
  const employee = await seed.employee({ startDate });
  const employees = employeeUseCases(orm);
  const editReady = Promise.withResolvers<number>();
  const releaseEdit = Promise.withResolvers<void>();
  const editing = transact(async (tx) => {
    await employeeRepository(tx).lockByIds([employee.id]);
    await employmentRepository(tx).setStartDate(employee.id, changedDate);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    editReady.resolve(rows[0]!.pid);
    await releaseEdit.promise;
  });
  const blockingPid = await editReady.promise;

  const results = Promise.allSettled([
    editing,
    employees.updateEmployee(OWNER, { id: employee.id, startDate }),
  ]);
  try {
    await expectBlockedBy(orm, blockingPid);
  } finally {
    releaseEdit.resolve();
    await results;
  }

  expect(await results).toMatchObject([
    { status: "fulfilled" },
    {
      status: "fulfilled",
      value: {
        historyLine: {
          changes: [{ field: "startDate", oldValue: changedDate, newValue: startDate }],
        },
      },
    },
  ]);
});
