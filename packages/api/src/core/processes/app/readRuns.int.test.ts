import {
  ADMIN,
  EMPLOYEE,
  calendarDate,
  expect,
  processService,
  signedIn,
  taskService,
  test,
} from "#test/support";

import { WELCOME_NEW_STARTER } from "../domain";

test("lists an admin's runs newest first", async ({ orm, seed }) => {
  const firstPerson = await seed.employee();
  const secondPerson = await seed.employee();
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const first = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: firstPerson.id,
  });
  const second = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: secondPerson.id,
  });

  const runs = await processes.listRuns(ADMIN, WELCOME_NEW_STARTER);

  expect(runs.map(({ id }) => id)).toEqual([second.run.id, first.run.id]);
});

test("an employee cannot list runs or read another step through the run", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  await expect(processes.listRuns(EMPLOYEE, WELCOME_NEW_STARTER)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(processes.readRun(ctx, started.run.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("the coffee-calls assignee sees progress without the other step's details", async ({
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

  expect(await processes.readStepProgress(ctx, started.steps[1]!.task!.id)).toEqual({
    processName: "Welcome a new starter",
    subjectEmployeeId: employee.id,
    status: "in_progress",
    doneSteps: 0,
    totalSteps: 2,
  });
  await expect(taskService(orm).readTask(ctx, started.steps[0]!.task!.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("hides a task's progress and completion commands from an unrelated caller", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const unrelated = await seed.employee();
  const ctx = signedIn(orm, { employeeId: unrelated.id, profiles: ["ADMIN"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;

  await expect(processes.readStepProgress(ctx, taskId)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
  await expect(processes.markStepDone(ctx, taskId)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
  await expect(processes.reopenStep(ctx, taskId)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("reports an unknown run", async ({ orm }) => {
  await expect(
    processService(orm).readRun(ADMIN, "00000000-0000-4000-8000-000000000001"),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No process run has this id.",
  });
});

test("reset removes runs and their tasks and turns automatic starts off", async ({
  orm,
  seed,
  transact,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const [original] = await processes.listProcesses(ADMIN);
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  await transact((tx) => processes.resetProcesses(ADMIN, tx));

  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toEqual([]);
  expect(await processes.listProcesses(ADMIN)).toEqual([original]);
  await expect(
    taskService(orm).readTask(managerCtx, started.steps[0]!.task!.id),
  ).rejects.toMatchObject({ code: "NOT_FOUND", message: "No task has this id." });
  await expect(taskService(orm).readTask(ctx, started.steps[1]!.task!.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});
