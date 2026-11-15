import { expect, signedIn, taskService, test } from "#test/support";

test("lets the asker delete a task to do for both people", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
  });
  const assigneeCtx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const askerCtx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  expect(await tasks.deleteTask(askerCtx, task.id)).toEqual({ deletedTaskId: task.id });

  await expect(tasks.readTask(askerCtx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
  await expect(tasks.readTask(assigneeCtx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
  expect(await tasks.listMyTasks(askerCtx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
  expect(await tasks.listMyTasks(assigneeCtx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
});

test("refuses deletion by the assignee who did not ask for the task", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.deleteTask(ctx, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the person who asked can delete this task.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("hides a task from an unrelated caller trying to delete it", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const other = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    subjectEmployeeId: other.id,
  });
  const ctx = signedIn(orm, { employeeId: other.id, profiles: ["OWNER"] });

  await expect(taskService(orm).deleteTask(ctx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("reports an unknown task as not found when deleting it", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  await expect(
    taskService(orm).deleteTask(ctx, "00000000-0000-4000-8000-000000000001"),
  ).rejects.toMatchObject({ code: "NOT_FOUND", message: "No task has this id." });
});

test("refuses deletion of a done task", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: assignee.id,
  });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.deleteTask(ctx, task.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task is already done.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("refuses deletion of a cancelled task", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    status: "cancelled",
    cancelledAt: new Date("2026-11-08T12:00:00Z"),
    cancelReason: "No longer needed",
  });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.deleteTask(ctx, task.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task was cancelled.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("refuses deletion of a process step task by its assignee", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const task = await seed.task({
    type: "process_step_to_do",
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: null,
  });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  await expect(tasks.deleteTask(ctx, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the person who asked can delete this task.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});
