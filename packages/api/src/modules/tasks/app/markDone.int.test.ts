import { expect, recordHistory, signedIn, taskService, test } from "#test/support";

test("marks a held task done and shows the asker who completed it", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const holderCtx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const askerCtx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const done = await tasks.markDone(holderCtx, task.id);

  expect(done).toMatchObject({
    status: "done",
    doneByEmployeeId: holder.id,
    doneAt: expect.any(Date) as unknown,
  });
  expect(await tasks.readTask(askerCtx, task.id)).toEqual(done);
  expect(await tasks.listMyTasks(askerCtx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [done],
  });
});

test("refuses completion by the person who asked", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.markDone(ctx, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the person who holds this task can mark it done.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("refuses completion while a task is waiting", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: holder.id,
    requestedByEmployeeId: asker.id,
    status: "waiting",
  });
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.markDone(ctx, task.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task is waiting.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("accepts only the first of two concurrent completions", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const results = await Promise.allSettled([
    tasks.markDone(ctx, task.id),
    tasks.markDone(ctx, task.id),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { code: "CONFLICT", message: "This task is already done." } },
  ]);
  expect(await tasks.readTask(ctx, task.id)).toMatchObject({
    status: "done",
    doneByEmployeeId: holder.id,
  });
});

test("records creation and completion in the task's history", async ({ orm, seed, transact }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);
  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: holder.id,
      requestedByEmployeeId: asker.id,
    }),
  );

  await tasks.markDone(ctx, task.id);

  const history = await recordHistory.read(orm, "task", task.id, { first: 10 });
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      operation: "UPDATED",
      changes: expect.arrayContaining([
        { field: "status", oldValue: "to_do", newValue: "done" },
      ]) as unknown,
    },
    {
      operation: "CREATED",
      changes: expect.arrayContaining([
        { field: "status", oldValue: null, newValue: "to_do" },
      ]) as unknown,
    },
  ]);
});

test("hides a task from an unrelated caller trying to complete it", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const other = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: holder.id,
    requestedByEmployeeId: asker.id,
    aboutEmployeeId: other.id,
  });
  const ctx = signedIn(orm, { employeeId: other.id, profiles: ["OWNER"] });

  await expect(taskService(orm).markDone(ctx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("reports an unknown task as not found when completing it", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  await expect(
    taskService(orm).markDone(ctx, "00000000-0000-4000-8000-000000000001"),
  ).rejects.toMatchObject({ code: "NOT_FOUND", message: "No task has this id." });
});
