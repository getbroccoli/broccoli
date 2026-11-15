import { assert } from "vitest";

import {
  actionProcess,
  ADMIN,
  afterCommitProcess,
  afterCommitProcesses,
  calendarDate,
  employeeServices,
  expect,
  processService,
  seedProcess,
  signedIn,
  taskService,
  test,
  testActions,
  transactWithProcesses,
} from "#test/support";

import type { StoredProcessDefinition } from "../domain";

test("leaves no run when an action fails at run start", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const definition = actionProcess();
  definition.steps = [{ key: "fail", kind: "action", action: { name: "test.fail", params: {} } }];
  const { key } = await seedProcess(orm, { key: "actions", definition });
  const { actions } = testActions(orm);
  const processes = processService(orm, { today, actions });

  await expect(
    processes.startRun(ADMIN, { processKey: key, recordId: employee.id }),
  ).rejects.toThrow("Action failed");

  expect(await processes.listRuns(ADMIN, key)).toEqual([]);
});

test("keeps a task to do when the action after it fails", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const definition = actionProcess();
  definition.steps = [
    definition.steps[0]!,
    { key: "fail", kind: "action", after: ["prepare"], action: { name: "test.fail", params: {} } },
  ];
  const { key } = await seedProcess(orm, { key: "actions", definition });
  const { actions } = testActions(orm);
  const transact = transactWithProcesses(orm, { today, actions });
  const processes = processService(orm, { today, transact, actions });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const taskId = started.steps[0]!.task!.id;

  await expect(tasks.markDone(ctx, taskId)).rejects.toThrow("Action failed");

  expect(await tasks.readTask(ctx, taskId)).toMatchObject({ status: "to_do" });
  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.run.status).toBe("in_progress");
  expect(progress.steps).toMatchObject([
    { key: "prepare", status: "step_awaiting_task_completion", finishedAt: null },
    { key: "fail", status: "step_waiting_to_start", task: null, finishedAt: null },
  ]);
});

test("an action's to-do rolls back with a later failing action", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const definition = actionProcess();
  definition.steps = [
    {
      key: "record",
      kind: "action",
      action: { name: "test.record_call", params: { note: "Recorded" } },
    },
    { key: "fail", kind: "action", after: ["record"], action: { name: "test.fail", params: {} } },
  ];
  const { key } = await seedProcess(orm, { key: "actions", definition });
  const { actions } = testActions(orm);
  const processes = processService(orm, { today, actions });

  await expect(
    processes.startRun(ADMIN, { processKey: key, recordId: employee.id }),
  ).rejects.toThrow("Action failed");

  expect(await processes.listRuns(ADMIN, key)).toEqual([]);
  expect(
    (await taskService(orm).listMyTasks(ctx)).needsYou.filter(({ title }) => title === "Recorded"),
  ).toEqual([]);
});

test("a redelivered after-commit job commits the action's to-do once", async ({ orm }) => {
  const definition: StoredProcessDefinition = afterCommitProcess("employees.added");
  definition.steps = [
    {
      key: "record",
      kind: "action",
      action: { name: "test.fail_once", params: { note: "Recorded" } },
    },
  ];
  const { key } = await seedProcess(orm, { key: "actions", definition });
  const { actions } = testActions(orm);
  const { transact, queuedJobs, runJob } = afterCommitProcesses(orm, { today, actions });
  const processes = processService(orm, { today, actions });
  const employee = await employeeServices(orm, { transact }).createEmployee(ADMIN, {
    firstName: "Sam",
    lastName: "New",
    email: "sam@example.com",
  });
  assert(employee);
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  expect(queuedJobs).toHaveLength(1);
  const job = queuedJobs[0]!;

  await expect(runJob(job)).rejects.toThrow("Action failed");
  expect(await processes.listRuns(ADMIN, key)).toEqual([]);
  expect((await taskService(orm).listMyTasks(ctx)).needsYou).toEqual([]);
  await runJob(job);

  expect(await processes.listRuns(ADMIN, key)).toMatchObject([
    { status: "finished", record: { recordType: "employee", recordId: employee.id } },
  ]);
  expect((await taskService(orm).listMyTasks(ctx)).needsYou).toMatchObject([
    {
      title: "Recorded",
      status: "to_do",
      assigneeEmployeeId: employee.id,
      record: { recordType: "employee", recordId: employee.id },
    },
  ]);
});

const today = () => calendarDate("2026-12-03");
