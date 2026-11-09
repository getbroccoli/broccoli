import { expect, signedIn, taskService, test } from "#test/support";

test("lets the asker cancel a task with a reason visible to both people", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const holderCtx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const askerCtx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const { task: cancelled } = await tasks.cancel(askerCtx, task.id, "  No longer needed  ");

  expect(cancelled).toMatchObject({
    status: "cancelled",
    cancelledAt: expect.any(Date) as unknown,
    cancelReason: "No longer needed",
  });
  expect(await tasks.listMyTasks(holderCtx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [cancelled],
  });
  expect(await tasks.listMyTasks(askerCtx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [cancelled],
  });
});

test("refuses cancellation by the holder", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.cancel(ctx, task.id, "No longer needed")).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the person who asked can cancel this task.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("refuses a blank cancellation reason without changing the task", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.cancel(ctx, task.id, " \n\t ")).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "reason", code: "required" }],
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("refuses cancellation of a done task", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: holder.id,
    requestedByEmployeeId: asker.id,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: holder.id,
  });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });

  await expect(taskService(orm).cancel(ctx, task.id, "No longer needed")).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task is already done.",
  });
});

test("records cancellation and its trimmed reason in the task's history", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });

  const { historyLine } = await taskService(orm).cancel(ctx, task.id, "  No longer needed  ");

  expect(historyLine).toMatchObject({
    recordType: "task",
    recordId: task.id,
    operation: "UPDATED",
    reason: "No longer needed",
    changes: [{ field: "status", oldValue: "to_do", newValue: "cancelled" }],
  });
});

test("hides a task from an unrelated caller trying to cancel it", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const other = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: holder.id,
    requestedByEmployeeId: asker.id,
    aboutEmployeeId: other.id,
  });
  const ctx = signedIn(orm, { employeeId: other.id, profiles: ["OWNER"] });

  await expect(taskService(orm).cancel(ctx, task.id, "No longer needed")).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("reports an unknown task as not found when cancelling it", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  await expect(
    taskService(orm).cancel(ctx, "00000000-0000-4000-8000-000000000001", "No longer needed"),
  ).rejects.toMatchObject({ code: "NOT_FOUND", message: "No task has this id." });
});
