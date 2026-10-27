import {
  recordChangedEvents,
  employeeUseCases,
  expect,
  expectHistoryReplaysTo,
  OWNER,
  test,
} from "#test/support";

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

  expect(await employees.readManager(OWNER, employee.id)).toEqual(manager);
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
      { field: "manager", oldValue: null, newValue: "Robin Reed" },
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
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  });

  const updated = await employees.updateEmployee(OWNER, {
    id: employee.id,
    [field]: null,
    changeReason: "  ",
  });

  expect(updated.employee).toEqual({ ...employee, [field]: null });
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges[0]!.node).toMatchObject({
    reason: null,
    changes: [{ field, oldValue: employee[field], newValue: null }],
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

test("parallel job title edits keep their old and new values chained", async ({ orm }) => {
  const employees = employeeUseCases(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Engineer",
  });

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

  const updated = await employees.updateEmployee(OWNER, {
    id: employee.id.toUpperCase(),
    jobTitle: "Lead",
  });

  expect(updated.employee.id).toBe(employee.id);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges.map(({ node }) => ({ recordId: node.recordId, operation: node.operation }))).toEqual(
    [
      { recordId: employee.id, operation: "UPDATED" },
      { recordId: employee.id, operation: "CREATED" },
    ],
  );
  await expectHistoryReplaysTo(orm, employee.id);
});
