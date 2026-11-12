import { expect, signedIn, taskService, test } from "#test/support";

test("lets the assignee reopen a done task back into needs you", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: assignee.id,
  });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const { task: reopened } = await tasks.reopen(ctx, task.id);

  expect(reopened).toMatchObject({ status: "to_do", doneAt: null, doneByEmployeeId: null });
  expect(await tasks.listMyTasks(ctx)).toEqual({
    needsYou: [reopened],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
});

test("refuses reopening by the person who asked", async ({ orm, seed }) => {
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

  await expect(tasks.reopen(ctx, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the person who holds this task can reopen it.",
  });
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);
});

test("refuses reopening a task that is already to do", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });

  await expect(taskService(orm).reopen(ctx, task.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Only a done task can be reopened.",
  });
});

test("records reopening in the task's history", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: assignee.id,
  });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });

  const { historyLine } = await taskService(orm).reopen(ctx, task.id);

  expect(historyLine).toMatchObject({
    recordType: "task",
    recordId: task.id,
    operation: "UPDATED",
    changes: [{ field: "status", oldValue: "done", newValue: "to_do" }],
  });
});

test("hides a task from an unrelated caller trying to reopen it", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const other = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
    subjectEmployeeId: other.id,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: assignee.id,
  });
  const ctx = signedIn(orm, { employeeId: other.id, profiles: ["OWNER"] });

  await expect(taskService(orm).reopen(ctx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("reports an unknown task as not found when reopening it", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  await expect(
    taskService(orm).reopen(ctx, "00000000-0000-4000-8000-000000000001"),
  ).rejects.toMatchObject({ code: "NOT_FOUND", message: "No task has this id." });
});
