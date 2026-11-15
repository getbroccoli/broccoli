import { expect, signedIn, taskService, test } from "#test/support";

test("lets the assignee read creation and completion newest first", async ({
  orm,
  seed,
  transact,
}) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);
  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: assignee.id,
      askedByEmployeeId: asker.id,
    }),
  );
  const { historyLine } = await tasks.markDone(ctx, task.id);

  const history = await tasks.readTaskHistory(ctx, task.id, {});

  expect(history.edges.map(({ node }) => node)).toEqual([
    historyLine,
    expect.objectContaining({
      recordId: task.id,
      operation: "CREATED",
      changes: expect.arrayContaining([
        { field: "status", oldValue: null, newValue: "to_do" },
      ]) as unknown,
    }) as unknown,
  ]);
});

test("lets the person who asked read the task's history", async ({ orm, seed, transact }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);
  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: assignee.id,
      askedByEmployeeId: asker.id,
    }),
  );

  const history = await tasks.readTaskHistory(ctx, task.id, {});

  expect(history.edges.map(({ node }) => node)).toMatchObject([
    { recordId: task.id, operation: "CREATED" },
  ]);
});

test("refuses task history to an unrelated person even when they are the owner", async ({
  orm,
  seed,
}) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const other = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: other.id, profiles: ["OWNER"] });

  await expect(taskService(orm).readTaskHistory(ctx, task.id, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot read this history.",
  });
});

test("refuses task history to the person the task is about", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const about = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    subjectEmployeeId: about.id,
  });
  const ctx = signedIn(orm, { employeeId: about.id, profiles: ["EMPLOYEE"] });

  await expect(taskService(orm).readTaskHistory(ctx, task.id, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot read this history.",
  });
});

test("refuses history of an unknown task", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  await expect(
    taskService(orm).readTaskHistory(ctx, "00000000-0000-4000-8000-000000000001", {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "You cannot read this history." });
});
