import { sql } from "drizzle-orm";

import {
  ADMIN,
  SYSTEM,
  calendarDate,
  employeeServices,
  expect,
  expectBlockedBy,
  processService,
  seedProcess,
  signedIn,
  taskService,
  test,
  transactWithProcesses,
} from "#test/support";

import { ormOf } from "../../db";
import { processRepository } from "../db";
import { ONBOARDING_EXAMPLE, type StoredProcessDefinition } from "../domain";

test("starts independent steps; dependent steps wait without tasks", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const { key } = await seedProcess(orm, { key: "handover", definition: handoverDefinition() });
  const processes = processService(orm, { today });

  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });

  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.run).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(progress.steps).toMatchObject([
    {
      key: "prepare",
      status: "step_awaiting_task_completion",
      task: { status: "to_do", assigneeEmployeeId: manager.id },
    },
    {
      key: "read",
      status: "step_awaiting_task_completion",
      task: { status: "to_do", assigneeEmployeeId: employee.id },
    },
    { key: "check", status: "step_waiting_to_start", task: null, finishedAt: null },
  ]);
  expect(started.steps).toEqual(progress.steps);
});

test("starts the waiting step once its last listed step is done", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const { key } = await seedProcess(orm, { key: "handover", definition: handoverDefinition() });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });

  await tasks.markDone(managerCtx, started.steps[0]!.task!.id);

  const waiting = await processes.readRun(ADMIN, started.run.id);
  expect(waiting.steps[2]).toMatchObject({
    key: "check",
    status: "step_waiting_to_start",
    task: null,
    finishedAt: null,
  });

  await tasks.markDone(ctx, started.steps[1]!.task!.id);

  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.run).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(progress.steps).toMatchObject([
    { key: "prepare", status: "step_completed" },
    { key: "read", status: "step_completed" },
    {
      key: "check",
      status: "step_awaiting_task_completion",
      finishedAt: null,
      task: { status: "to_do", assigneeEmployeeId: employee.id },
    },
  ]);
});

test("finishes the run once the task of the waiting step is done too", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const { key } = await seedProcess(orm, { key: "handover", definition: handoverDefinition() });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  await tasks.markDone(managerCtx, started.steps[0]!.task!.id);
  await tasks.markDone(ctx, started.steps[1]!.task!.id);
  const ready = await processes.readRun(ADMIN, started.run.id);

  await tasks.markDone(ctx, ready.steps[2]!.task!.id);

  const completed = await processes.readRun(ADMIN, started.run.id);
  expect(completed.run.status).toBe("finished");
  expect(completed.run.finishedAt).toBeInstanceOf(Date);
  expect(completed.steps).toMatchObject([
    { key: "prepare", status: "step_completed", task: { status: "done" } },
    { key: "read", status: "step_completed", task: { status: "done" } },
    { key: "check", status: "step_completed", task: { status: "done" } },
  ]);
});

test("concurrent completions start the waiting step once", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const { key } = await seedProcess(orm, { key: "handover", definition: handoverDefinition() });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
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
  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.run).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(progress.steps).toMatchObject([
    { key: "prepare", status: "step_completed" },
    { key: "read", status: "step_completed" },
    { key: "check", status: "step_awaiting_task_completion", task: { status: "to_do" } },
  ]);
  expect((await tasks.listMyTasks(ctx)).needsYou).toMatchObject([
    {
      id: progress.steps[2]!.task!.id,
      title: "Check the handover",
      assigneeEmployeeId: employee.id,
    },
  ]);
});

test("starts a step after its prerequisite was skipped", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const definition = handoverDefinition();
  definition.steps = [definition.steps[0]!, { ...definition.steps[2]!, after: ["prepare"] }];
  const { key } = await seedProcess(orm, { key: "handover", definition });
  const processes = processService(orm, { today });

  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });

  expect(started.run.status).toBe("in_progress");
  expect(started.steps).toMatchObject([
    {
      key: "prepare",
      status: "step_skipped",
      skipReason: "no_assignee_for_step",
      task: null,
    },
    {
      key: "check",
      status: "step_awaiting_task_completion",
      task: { status: "to_do", assigneeEmployeeId: employee.id },
    },
  ]);
});

test("cancels waiting steps after the subject was removed", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const { key } = await seedProcess(orm, {
    key: "handover",
    definition: handoverDefinition(),
    turnedOn: false,
  });
  const processes = processService(orm, { today });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  expect(started.steps[2]).toMatchObject({ status: "step_waiting_to_start", task: null });
  await employeeServices(orm).deleteEmployee(ADMIN, { id: employee.id });

  expect(await processes.startDueRuns(SYSTEM, today())).toEqual({
    runsStarted: 0,
    runsCancelled: 1,
  });

  const cancelled = await processes.readRun(ADMIN, started.run.id);
  expect(cancelled.run).toMatchObject({
    status: "cancelled",
    cancelCause: "cancelled_because_subject_was_removed",
  });
  expect(cancelled.steps[2]).toMatchObject({
    key: "check",
    status: "step_cancelled",
    task: null,
    finishedAt: expect.any(Date) as unknown,
  });
});

test("Onboarding waits for provisioning before the account check", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const ownerEmployee = await seed.employee({ userId: owner.user!.userId });
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ownerCtx = signedIn(orm, { employeeId: ownerEmployee.id, profiles: ["OWNER"] });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, {
    processKey: ONBOARDING_EXAMPLE,
    recordId: employee.id,
  });
  expect(started.steps.slice(0, 4)).toMatchObject([
    { key: "one_to_one", task: { status: "to_do", assigneeEmployeeId: manager.id } },
    { key: "coffee_breaks", task: { status: "to_do", assigneeEmployeeId: employee.id } },
    { key: "provision_accounts", task: { status: "to_do", assigneeEmployeeId: ownerEmployee.id } },
    { key: "ensure_provision", status: "step_waiting_to_start", task: null },
  ]);

  await tasks.markDone(ownerCtx, started.steps[2]!.task!.id);

  const progress = await processes.readRun(ADMIN, started.run.id);
  expect(progress.steps[3]).toMatchObject({
    key: "ensure_provision",
    status: "step_awaiting_task_completion",
    task: { status: "to_do", assigneeEmployeeId: employee.id },
  });
  expect(await tasks.readTask(ctx, progress.steps[3]!.task!.id)).toMatchObject({
    title: "Check that your accounts work",
    status: "to_do",
    assigneeEmployeeId: employee.id,
    resultForm: {
      kind: "choice",
      display: "buttons",
      options: [
        { code: "yes", label: "Yes", commentRequired: false },
        { code: "no", label: "No", commentRequired: true },
      ],
    },
  });

  await tasks.markDone(ctx, progress.steps[3]!.task!.id, {
    result: { code: "no", comment: "VPN login fails" },
  });

  expect((await processes.readRun(ADMIN, started.run.id)).steps[3]).toMatchObject({
    status: "step_completed",
    result: { code: "no", comment: "VPN login fails" },
  });
});

function handoverDefinition(): StoredProcessDefinition {
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
        key: "prepare",
        kind: "task",
        after: [],
        task: {
          assignee: { kind: "subjects_manager" },
          title: "Prepare the handover",
          description: null,
          resultForm: null,
          due: { amount: 0, unit: "calendar_days" },
        },
      },
      {
        key: "read",
        kind: "task",
        after: [],
        task: {
          assignee: { kind: "subject" },
          title: "Read the handbook",
          description: null,
          resultForm: null,
          due: { amount: 0, unit: "calendar_days" },
        },
      },
      {
        key: "check",
        kind: "task",
        after: ["prepare", "read"],
        task: {
          assignee: { kind: "subject" },
          title: "Check the handover",
          description: null,
          resultForm: null,
          due: { amount: 0, unit: "calendar_days" },
        },
      },
    ],
  };
}

const today = () => calendarDate("2026-12-03");
