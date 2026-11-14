import { domainEvents, expect, signedIn, taskService, test } from "#test/support";

test("marks a held task done and shows the asker who completed it", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const assigneeCtx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const askerCtx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const { task: done } = await tasks.markDone(assigneeCtx, task.id);

  expect(done).toMatchObject({
    status: "done",
    doneByEmployeeId: assignee.id,
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
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.markDone(ctx, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the person who holds this task can mark it done.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("refuses completion while a task is waiting", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    status: "waiting",
  });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.markDone(ctx, task.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task is waiting.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("accepts only the first of two concurrent completions", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
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
    doneByEmployeeId: assignee.id,
  });
});

test("returns the history line appended by completion", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });

  const { historyLine } = await taskService(orm).markDone(ctx, task.id);

  expect(historyLine).toMatchObject({
    recordType: "task",
    recordId: task.id,
    operation: "UPDATED",
    changes: [{ field: "status", oldValue: "to_do", newValue: "done" }],
  });
});

test("hides a task from an unrelated caller trying to complete it", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const other = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    subjectEmployeeId: other.id,
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

test("publishes a status change with the assignee who marked the task done", async ({
  orm,
  seed,
}) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const { transact, events } = domainEvents(orm);

  await taskService(orm, { transact }).markDone(ctx, task.id);

  expect(events).toEqual([
    {
      type: "tasks.task_status_changed",
      payload: {
        taskId: task.id,
        from: "to_do",
        to: "done",
        byEmployeeId: assignee.id,
      },
    },
  ]);
});
