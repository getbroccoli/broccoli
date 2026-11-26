import { sql } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  expect,
  expectBlockedBy,
  processService,
  seedProcess,
  seedSecondProcessVersion,
  signedIn,
  taskService,
  test,
  type TestSeed,
  transactWithProcesses,
  type TaskStepsDefinition,
} from "#test/support";

import { type Orm, ormOf } from "../../db";
import { processRepository } from "../db";
import { ONBOARDING_EXAMPLE } from "../domain";

test("a No answer gives the owner a fix task and waits for its completion before lunch", async ({
  orm,
  seed,
}) => {
  const { processes, tasks, employee, manager, ownerEmployee, ctx, ownerCtx, ready } =
    await provisionedOnboarding(orm, seed);

  await tasks.markDone(ctx, ready.steps[3]!.task!.id, {
    result: { code: "no", comment: "VPN login fails" },
  });

  const fixing = await processes.readRun(ADMIN, ready.run.id);
  expect(fixing.steps[4]).toMatchObject({
    key: "fix_accounts",
    title: `Fix ${employee.firstName}'s accounts`,
    status: "step_awaiting_task_completion",
    task: { assigneeEmployeeId: ownerEmployee.id },
  });
  expect(fixing.steps[5]).toMatchObject({
    key: "welcome_lunch",
    status: "step_waiting_to_start",
    task: null,
  });

  await tasks.markDone(ownerCtx, fixing.steps[4]!.task!.id);

  const lunch = await processes.readRun(ADMIN, ready.run.id);
  expect(lunch.steps[5]).toMatchObject({
    key: "welcome_lunch",
    title: `Take ${employee.firstName} to lunch`,
    status: "step_awaiting_task_completion",
    task: { assigneeEmployeeId: manager.id },
  });
});

test("a Yes answer leaves the fix not reached and starts lunch before the run finishes", async ({
  orm,
  seed,
}) => {
  const { processes, tasks, manager, ctx, managerCtx, ready } = await provisionedOnboarding(
    orm,
    seed,
  );

  await tasks.markDone(ctx, ready.steps[3]!.task!.id, { result: { code: "yes", comment: null } });

  const lunch = await processes.readRun(ADMIN, ready.run.id);
  expect(lunch.steps[4]).toMatchObject({
    key: "fix_accounts",
    status: "step_not_reached",
    task: null,
    finishedAt: expect.any(Date) as unknown,
    result: null,
    skipReason: null,
    assigneeNote: null,
  });
  expect(lunch.steps[5]).toMatchObject({
    key: "welcome_lunch",
    status: "step_awaiting_task_completion",
    task: { assigneeEmployeeId: manager.id },
  });
  expect(lunch.run.status).toBe("in_progress");

  await tasks.markDone(managerCtx, lunch.steps[0]!.task!.id);
  await tasks.markDone(ctx, lunch.steps[1]!.task!.id);
  await tasks.markDone(managerCtx, lunch.steps[5]!.task!.id);

  const finished = await processes.readRun(ADMIN, ready.run.id);
  expect(finished.run).toMatchObject({
    status: "finished",
    finishedAt: expect.any(Date) as unknown,
  });
  expect(finished.steps[4]).toEqual(lunch.steps[4]);
});

test("saves a pass with only not-reached changes and finishes the run", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const { key } = await seedProcess(orm, { key: "accounts", definition: branchDefinition() });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });

  await tasks.markDone(ctx, started.steps[0]!.task!.id, { result: { code: "yes", comment: null } });

  const finished = await processes.readRun(ADMIN, started.run.id);
  expect(finished.run).toMatchObject({
    status: "finished",
    finishedAt: expect.any(Date) as unknown,
  });
  expect(finished.steps).toMatchObject([
    { key: "answer", status: "step_completed", result: { code: "yes", comment: null } },
    { key: "fix", status: "step_not_reached", task: null, finishedAt: expect.any(Date) as unknown },
  ]);
});

test("stores result followers as not reached when the answering step has no assignee", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const definition = branchDefinition();
  definition.steps[0]!.task.assignee = { kind: "subjects_manager" };
  const { key } = await seedProcess(orm, { key: "accounts", definition });
  const processes = processService(orm, { today });

  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });

  const stored = await processes.readRun(ADMIN, started.run.id);
  expect(stored.run.status).toBe("finished");
  expect(stored.steps).toMatchObject([
    { key: "answer", status: "step_skipped", task: null, result: null },
    {
      key: "fix",
      status: "step_not_reached",
      task: null,
      finishedAt: expect.any(Date) as unknown,
      result: null,
      assigneeNote: null,
      skipReason: null,
    },
  ]);
  expect(started.steps).toEqual(stored.steps);
});

test("concurrent branch completions start an any follower once", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const definition = branchDefinition();
  const answer = definition.steps[0]!;
  definition.steps = [
    { ...answer, key: "left" },
    { ...answer, key: "right" },
    { ...definition.steps[1]!, after: ["left", "right"], join: "any" },
  ];
  const { key } = await seedProcess(orm, { key: "accounts", definition });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const locked = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const leftDone = transact(async (tx) => {
    const leftTasks = taskService(orm, { transact: (work) => work(tx) });
    const result = await leftTasks.markDone(ctx, started.steps[0]!.task!.id, {
      result: { code: "yes", comment: null },
    });
    await processRepository(tx).lockRun(started.run.id);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    locked.resolve(rows[0]!.pid);
    await release.promise;
    return result;
  });
  await Promise.race([locked.promise, leftDone]);
  const rightDone = tasks.markDone(ctx, started.steps[1]!.task!.id, {
    result: { code: "yes", comment: null },
  });
  const results = Promise.allSettled([leftDone, rightDone]);

  try {
    await expectBlockedBy(orm, await locked.promise);
  } finally {
    release.resolve();
    await results;
  }

  expect(await results).toMatchObject([{ status: "fulfilled" }, { status: "fulfilled" }]);
  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.steps).toMatchObject([
    { key: "left", status: "step_completed" },
    { key: "right", status: "step_completed" },
    { key: "fix", status: "step_awaiting_task_completion" },
  ]);
  expect((await tasks.listMyTasks(ctx)).needsYou).toMatchObject([
    { id: progress.steps[2]!.task!.id, title: "Fix accounts" },
  ]);
});

test("an existing run branches on its version's codes after a renamed version is published", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const { id, key } = await seedProcess(orm, { key: "accounts", definition: branchDefinition() });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const secondDefinition = branchDefinition("needs_fix");
  const version = await seedSecondProcessVersion(orm, {
    processId: id,
    definition: secondDefinition,
  });
  expect((await processes.listProcesses(ADMIN)).find((process) => process.id === id)).toMatchObject(
    {
      activeVersion: { id: version.id, version: 2 },
    },
  );

  await tasks.markDone(ctx, started.steps[0]!.task!.id, { result: { code: "no", comment: null } });

  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.steps).toMatchObject([
    { key: "answer", status: "step_completed", result: { code: "no", comment: null } },
    {
      key: "fix",
      status: "step_awaiting_task_completion",
      task: { assigneeEmployeeId: employee.id },
    },
  ]);
});

test("step progress excludes not-reached steps from the total", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const { key } = await seedProcess(orm, { key: "accounts", definition: branchDefinition() });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const taskId = started.steps[0]!.task!.id;
  expect((await processes.readStepProgress(ctx, [taskId])).get(taskId)).toMatchObject({
    doneSteps: 0,
    totalSteps: 2,
  });

  await tasks.markDone(ctx, taskId, { result: { code: "yes", comment: null } });

  expect((await processes.readStepProgress(ctx, [taskId])).get(taskId)).toMatchObject({
    status: "finished",
    doneSteps: 1,
    totalSteps: 1,
  });
});

async function provisionedOnboarding(orm: Orm, seed: TestSeed) {
  const owner = await seed.owner();
  const ownerEmployee = await seed.employee({ userId: owner.user!.userId });
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ownerCtx = signedIn(orm, { employeeId: ownerEmployee.id, profiles: ["OWNER"] });
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: ONBOARDING_EXAMPLE,
    recordId: employee.id,
  });
  await tasks.markDone(ownerCtx, started.steps[2]!.task!.id);
  const ready = await processes.readRun(ADMIN, started.run.id);
  return { processes, tasks, employee, manager, ownerEmployee, ctx, ownerCtx, managerCtx, ready };
}

function branchDefinition(repairCode = "no"): TaskStepsDefinition {
  return {
    subject: { recordType: "employee" },
    trigger: {
      kind: "on_record_date",
      recordType: "employee",
      dateField: "startDate",
      offset: { amount: 0, unit: "calendar_days" },
      maxDaysLate: 7,
    },
    steps: [
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
              { code: repairCode, label: "No" },
            ],
          },
        },
      },
      {
        key: "fix",
        kind: "task",
        after: [{ step: "answer", when: { result: repairCode } }],
        task: {
          assignee: { kind: "subject" },
          title: "Fix accounts",
          due: { amount: 0, unit: "calendar_days" },
        },
      },
    ],
  };
}

const today = () => calendarDate("2026-12-03");
