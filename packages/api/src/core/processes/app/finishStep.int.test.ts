import {
  ADMIN,
  calendarDate,
  employeeServices,
  expect,
  processService,
  signedIn,
  taskService,
  test,
  transactWithProcesses,
} from "#test/support";

import { WELCOME_NEW_STARTER } from "../domain";

test("completing both assignees' tasks finishes the welcome and its steps", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });
  const meetingId = started.steps[0]!.task!.id;
  const coffeeId = started.steps[1]!.task!.id;

  await tasks.markDone(managerCtx, meetingId);
  await tasks.markDone(ctx, coffeeId);

  const completed = await processes.readRun(ADMIN, started.run.id);
  expect(completed.run).toMatchObject({
    status: "finished",
    finishedAt: expect.any(Date) as unknown,
  });
  expect(completed.steps).toMatchObject([
    { status: "step_completed", task: { status: "done" } },
    { status: "step_completed", task: { status: "done" } },
  ]);
  expect((await processes.readStepProgress(managerCtx, [meetingId])).get(meetingId)).toMatchObject({
    status: "finished",
    doneSteps: 2,
    totalSteps: 2,
  });
  expect((await processes.readStepProgress(ctx, [coffeeId])).get(coffeeId)).toMatchObject({
    status: "finished",
    doneSteps: 2,
    totalSteps: 2,
  });
});

test("completing the first of two tasks leaves the welcome in progress", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });
  const taskId = started.steps[0]!.task!.id;

  await tasks.markDone(ctx, taskId);

  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.run).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(progress.steps).toMatchObject([
    { status: "step_completed", task: { status: "done" } },
    { status: "step_awaiting_task_completion", task: { status: "to_do" } },
  ]);
  expect((await processes.readStepProgress(ctx, [taskId])).get(taskId)).toMatchObject({
    status: "in_progress",
    doneSteps: 1,
    totalSteps: 2,
  });
});

test("completing a manual task leaves an existing welcome unchanged", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });
  const task = await seed.task({ assigneeEmployeeId: employee.id, askedByEmployeeId: employee.id });
  const before = await processes.readRun(ADMIN, started.run.id);

  await tasks.markDone(ctx, task.id);

  expect((await tasks.readTask(ctx, task.id)).status).toBe("done");
  expect(await processes.readRun(ADMIN, started.run.id)).toEqual(before);
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toHaveLength(1);
});

test("completing a task after the subject was removed leaves the run for the daily check", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });
  const taskId = started.steps[0]!.task!.id;
  await employeeServices(orm).deleteEmployee(ADMIN, { id: employee.id });

  await tasks.markDone(ctx, taskId);

  expect(await tasks.readTask(ctx, taskId)).toMatchObject({
    status: "done",
    doneByEmployeeId: manager.id,
  });
  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.run).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(progress.steps[0]).toMatchObject({ status: "step_completed" });
});

test("completing the last task after the subject was removed leaves the run for the daily check", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });
  const meetingId = started.steps[0]!.task!.id;
  await tasks.markDone(ctx, started.steps[1]!.task!.id);
  await employeeServices(orm).deleteEmployee(ADMIN, { id: employee.id });

  await tasks.markDone(managerCtx, meetingId);

  expect(await tasks.readTask(managerCtx, meetingId)).toMatchObject({
    status: "done",
    doneByEmployeeId: manager.id,
  });
  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.run).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(progress.steps[0]).toMatchObject({ status: "step_completed" });
});

test("two assignees completing their tasks concurrently both succeed and finish one run", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });

  const results = await Promise.all([
    tasks.markDone(managerCtx, started.steps[0]!.task!.id),
    tasks.markDone(ctx, started.steps[1]!.task!.id),
  ]);

  expect(results).toMatchObject([{ task: { status: "done" } }, { task: { status: "done" } }]);
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toMatchObject([
    { id: started.run.id, status: "finished", finishedAt: expect.any(Date) as unknown },
  ]);
  expect((await processes.readRun(ADMIN, started.run.id)).steps).toMatchObject([
    { status: "step_completed", task: { status: "done" } },
    { status: "step_completed", task: { status: "done" } },
  ]);
});

test("completing a task after the other assignee was removed leaves the run for the daily check", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;
  await employeeServices(orm).deleteEmployee(ADMIN, { id: manager.id });

  await tasks.markDone(ctx, taskId);

  expect((await tasks.readTask(ctx, taskId)).status).toBe("done");
  expect((await processes.readRun(ADMIN, started.run.id)).run.status).toBe("in_progress");
});

test("a completed step whose assignee left does not stop the remaining work", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: employee.id,
  });
  await tasks.markDone(managerCtx, started.steps[0]!.task!.id);
  await employeeServices(orm).deleteEmployee(ADMIN, { id: manager.id });

  await tasks.markDone(ctx, started.steps[1]!.task!.id);

  const completed = await processes.readRun(ADMIN, started.run.id);
  expect(completed.run.status).toBe("finished");
  expect(completed.steps[0]).toMatchObject({ status: "step_completed", task: null });
});

const today = () => calendarDate("2026-12-03");
