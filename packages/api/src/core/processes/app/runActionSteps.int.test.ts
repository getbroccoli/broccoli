import { sql } from "drizzle-orm";

import {
  actionProcess,
  ADMIN,
  calendarDate,
  expect,
  expectBlockedBy,
  processService,
  seedProcess,
  signedIn,
  taskService,
  test,
  testActions,
  transactWithProcesses,
} from "#test/support";

import { ormOf } from "../../db";
import { processRepository } from "../db";

test("runs every action once at start and finishes a run with only actions", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const definition = actionProcess();
  definition.steps = [
    {
      kind: "action",
      key: "first",
      after: [],
      action: { name: "test.record_call", params: { note: "first" } },
    },
    {
      kind: "action",
      key: "second",
      after: ["first"],
      action: { name: "test.record_call", params: { note: "second" } },
    },
  ];
  const { key } = await seedProcess(orm, { key: "actions", definition });
  const { actions, calls } = testActions(orm);
  const processes = processService(orm, { today, actions });

  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });

  expect(calls).toEqual([
    { runId: started.run.id, stepKey: "first", note: "first" },
    { runId: started.run.id, stepKey: "second", note: "second" },
  ]);
  expect((await taskService(orm).listMyTasks(ctx)).needsYou).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: "first", status: "to_do", assigneeEmployeeId: employee.id }),
      expect.objectContaining({
        title: "second",
        status: "to_do",
        assigneeEmployeeId: employee.id,
      }),
    ]),
  );
  const finished = await processes.readRun(ADMIN, started.run.id);
  expect(finished.run).toMatchObject({
    status: "finished",
    finishedAt: expect.any(Date) as unknown,
  });
  expect(finished.steps).toMatchObject([
    { key: "first", status: "step_completed", task: null, finishedAt: expect.any(Date) as unknown },
    {
      key: "second",
      status: "step_completed",
      task: null,
      finishedAt: expect.any(Date) as unknown,
    },
  ]);
});

test("runs an action and creates the next task when its prerequisite task is marked done", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const { key } = await seedProcess(orm, { key: "actions", definition: actionProcess() });
  const { actions, calls } = testActions(orm);
  const transact = transactWithProcesses(orm, { today, actions });
  const processes = processService(orm, { today, transact, actions });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  expect(calls).toEqual([]);
  expect(started.steps[2]).toMatchObject({ status: "step_waiting_to_start", task: null });

  await tasks.markDone(ctx, started.steps[0]!.task!.id);

  expect(calls).toEqual([{ runId: started.run.id, stepKey: "tell_owner", note: "prepared" }]);
  expect(
    (await tasks.listMyTasks(ctx)).needsYou.filter(({ title }) => title === "prepared"),
  ).toMatchObject([{ title: "prepared", status: "to_do", assigneeEmployeeId: employee.id }]);
  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.steps).toMatchObject([
    { key: "prepare", status: "step_completed", task: { status: "done" } },
    { key: "tell_owner", status: "step_completed", task: null },
    {
      key: "check",
      status: "step_awaiting_task_completion",
      task: { status: "to_do", assigneeEmployeeId: employee.id },
    },
  ]);
});

test("never runs an action on a branch not taken", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const definition = actionProcess();
  definition.steps = [
    {
      key: "answer",
      kind: "task",
      task: {
        assignee: { kind: "subject" },
        title: "Check accounts",
        due: { amount: 0, unit: "calendar_days" },
        resultForm: {
          kind: "choice",
          options: [
            { code: "yes", label: "Yes" },
            { code: "no", label: "No", commentRequired: true },
          ],
        },
      },
    },
    { ...definition.steps[1]!, after: [{ step: "answer", when: { result: "no" } }] },
  ];
  const { key } = await seedProcess(orm, { key: "actions", definition });
  const { actions, calls } = testActions(orm);
  const transact = transactWithProcesses(orm, { today, actions });
  const processes = processService(orm, { today, transact, actions });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });

  await tasks.markDone(ctx, started.steps[0]!.task!.id, { result: { code: "yes", comment: null } });

  expect(calls).toEqual([]);
  const finished = await processes.readRun(ADMIN, started.run.id);
  expect(finished.run.status).toBe("finished");
  expect(finished.steps[1]).toMatchObject({
    key: "tell_owner",
    status: "step_not_reached",
    task: null,
  });
});

test("two assignees completing the last listed steps concurrently run the action once", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const definition = actionProcess();
  definition.steps = [
    {
      key: "prepare",
      kind: "task",
      task: {
        assignee: { kind: "subjects_manager" },
        title: "Prepare accounts",
        due: { amount: 0, unit: "calendar_days" },
      },
    },
    { ...definition.steps[2]!, after: [] },
    { ...definition.steps[1]!, after: ["prepare", "check"] },
  ];
  const { key } = await seedProcess(orm, { key: "actions", definition });
  const { actions, calls } = testActions(orm);
  const transact = transactWithProcesses(orm, { today, actions });
  const processes = processService(orm, { today, transact, actions });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const locked = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const managerDone = transact(async (tx) => {
    const managerTasks = taskService(orm, { transact: (work) => work(tx) });
    const result = await managerTasks.markDone(managerCtx, started.steps[0]!.task!.id);
    await processRepository(tx).lockRun(started.run.id);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    locked.resolve(rows[0]!.pid);
    await release.promise;
    return result;
  });
  await Promise.race([locked.promise, managerDone]);
  const employeeDone = tasks.markDone(ctx, started.steps[1]!.task!.id);
  const results = Promise.allSettled([managerDone, employeeDone]);

  try {
    await expectBlockedBy(orm, await locked.promise);
  } finally {
    release.resolve();
    await results;
  }

  expect(await results).toMatchObject([
    { status: "fulfilled", value: { task: { status: "done" } } },
    { status: "fulfilled", value: { task: { status: "done" } } },
  ]);
  expect(calls).toEqual([{ runId: started.run.id, stepKey: "tell_owner", note: "prepared" }]);
  expect(
    (await tasks.listMyTasks(ctx)).needsYou.filter(({ title }) => title === "prepared"),
  ).toMatchObject([{ title: "prepared", status: "to_do", assigneeEmployeeId: employee.id }]);
  const finished = await processes.readRun(ADMIN, started.run.id);
  expect(finished.run.status).toBe("finished");
  expect(finished.steps).toMatchObject([
    { key: "prepare", status: "step_completed" },
    { key: "check", status: "step_completed" },
    { key: "tell_owner", status: "step_completed", task: null },
  ]);
});

const today = () => calendarDate("2026-12-03");
