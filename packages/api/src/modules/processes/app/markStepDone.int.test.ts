import {
  ADMIN,
  calendarDate,
  employeeServices,
  expect,
  processService,
  signedIn,
  taskService,
  test,
} from "#test/support";

import { WELCOME_NEW_STARTER } from "../domain";

test("both assignees receive their tasks and completing both finishes the welcome", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const sam = await seed.employee({ firstName: "Sam" });
  await seed.manager(sam.id, manager.id);
  const samCtx = signedIn(orm, { employeeId: sam.id, profiles: ["EMPLOYEE"] });
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const tasks = taskService(orm);
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: sam.id,
  });
  const meetingId = started.steps[0]!.task!.id;
  const coffeeId = started.steps[1]!.task!.id;
  expect((await tasks.listMyTasks(managerCtx)).needsYou).toMatchObject([{ id: meetingId }]);
  expect((await tasks.listMyTasks(samCtx)).needsYou).toMatchObject([{ id: coffeeId }]);

  expect((await processes.markStepDone(managerCtx, meetingId)).run.status).toBe("in_progress");
  const completed = await processes.markStepDone(samCtx, coffeeId);

  expect(completed.run).toMatchObject({
    status: "finished",
    finishedAt: expect.any(Date) as unknown,
  });
  expect((await processes.readRun(ADMIN, started.run.id)).steps).toMatchObject([
    { status: "step_completed", task: { status: "done" } },
    { status: "step_completed", task: { status: "done" } },
  ]);
  expect((await processes.readRun(ADMIN, started.run.id)).run.status).toBe("finished");
  expect(await processes.readStepProgress(managerCtx, meetingId)).toMatchObject({
    status: "finished",
    doneSteps: 2,
    totalSteps: 2,
  });
  expect(await processes.readStepProgress(samCtx, coffeeId)).toMatchObject({
    status: "finished",
    doneSteps: 2,
    totalSteps: 2,
  });
});

test("generic task completion refuses a process task without changing it", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;

  await expect(taskService(orm).markDone(ctx, taskId)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task belongs to a process.",
  });
  expect((await processes.readRun(ADMIN, started.run.id)).steps[1]).toMatchObject({
    status: "step_awaiting_task_completion",
    task: { status: "to_do" },
  });
});

test("generic task reopening refuses a completed process task", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;
  await processes.markStepDone(ctx, taskId);

  await expect(taskService(orm).reopen(ctx, taskId)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task belongs to a process.",
  });
  expect((await processes.readRun(ADMIN, started.run.id)).run.status).toBe("finished");
});

test("reopening a completed step puts a finished run back in progress", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;
  expect((await processes.markStepDone(ctx, taskId)).run.status).toBe("finished");

  const reopened = await processes.reopenStep(ctx, taskId);

  expect(reopened.run).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(reopened.task).toMatchObject({ status: "to_do", doneAt: null, doneByEmployeeId: null });
  expect((await processes.readRun(ADMIN, started.run.id)).steps[1]).toMatchObject({
    status: "step_awaiting_task_completion",
    finishedAt: null,
  });
});

test("refuses reopening a step in a cancelled run", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;
  await processes.markStepDone(ctx, taskId);
  await processes.cancelRun(ADMIN, started.run.id, "No longer needed");

  await expect(processes.reopenStep(ctx, taskId)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This process was cancelled.",
  });
});

test("refuses reopening an older welcome while a newer one is in progress", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ firstName: "Sam" });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const first = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  const taskId = first.steps[1]!.task!.id;
  await processes.markStepDone(ctx, taskId);
  await processes.startRun(ADMIN, { processKey: WELCOME_NEW_STARTER, employeeId: employee.id });

  await expect(processes.reopenStep(ctx, taskId)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Welcome a new starter was started again for Sam; this run is closed.",
  });
  expect((await processes.readRun(ADMIN, first.run.id)).run.status).toBe("finished");
});

test("completing a remaining task persists cancellation when the other assignee was removed", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;
  await employeeServices(orm).deleteEmployee(ADMIN, { id: manager.id });

  const changed = await processes.markStepDone(ctx, taskId);

  expect(changed.run).toMatchObject({
    status: "cancelled",
    cancelCause: "cancelled_because_step_assignee_was_removed",
  });
  expect(changed.task).toMatchObject({
    status: "cancelled",
    cancelReason: "This process was cancelled.",
  });
  expect((await processes.readRun(ADMIN, started.run.id)).run.status).toBe("cancelled");
  expect(await taskService(orm).readTask(ctx, taskId)).toMatchObject({
    status: "cancelled",
    cancelReason: "This process was cancelled.",
  });
});

test("a completed step whose assignee left does not cancel the remaining work", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  await processes.markStepDone(managerCtx, started.steps[0]!.task!.id);
  await employeeServices(orm).deleteEmployee(ADMIN, { id: manager.id });

  const completed = await processes.markStepDone(ctx, started.steps[1]!.task!.id);

  expect(completed.run.status).toBe("finished");
  expect((await processes.readRun(ADMIN, started.run.id)).steps[0]).toMatchObject({
    status: "step_completed",
    task: null,
  });
});

test("refuses a manual task through the process completion commands", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: employee.id, askedByEmployeeId: employee.id });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm);

  await expect(processes.markStepDone(ctx, task.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task does not belong to a process.",
  });
  await expect(processes.reopenStep(ctx, task.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task does not belong to a process.",
  });
});
