import { assert } from "vitest";

import {
  ADMIN,
  afterCommitProcess,
  afterCommitProcesses,
  calendarDate,
  employeeServices,
  eventProcess,
  expect,
  processService,
  seedProcess,
  seedSecondProcessVersion,
  test,
} from "#test/support";

test("the change stays saved while its job waits and repeated delivery starts only one run", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const definition = afterCommitProcess("employees.added");
  // A finished run makes replay exercise the start key, not the run-in-progress guard.
  definition.steps[0]!.task.assignee = { kind: "subjects_manager" };
  const { id, key } = await seedProcess(orm, { key: "welcome", definition });
  const { transact, queuedJobs, runJob } = afterCommitProcesses(orm, { today });
  const processes = processService(orm);
  const process = (await processes.listProcesses(ADMIN)).find((process) => process.id === id);

  await transact(async (tx) => {
    await employeeServices(orm, { transact: (work) => work(tx) }).updateEmployee(ADMIN, {
      id: employee.id,
      jobTitle: "Engineer",
    });
    tx.publish("employees.added", { employeeIds: [employee.id] });
  });

  expect(await employeeServices(orm).readEmployee(ADMIN, employee.id)).toMatchObject({
    jobTitle: "Engineer",
  });
  expect(await processes.listRuns(ADMIN, key)).toEqual([]);
  expect(queuedJobs).toMatchObject([
    { processId: id, versionId: process!.activeVersion.id, hop: 1 },
  ]);
  const job = queuedJobs.shift();
  assert(job);
  await runJob(job);
  const runs = await processes.listRuns(ADMIN, key);
  expect(runs).toMatchObject([
    {
      status: "finished",
      startCause: "started_on_event",
      subjectEmployeeId: employee.id,
      record: { recordType: "employee", recordId: employee.id },
      triggerEvent: {
        id: job.event.id,
        type: "employees.added",
        payload: { employeeIds: [employee.id] },
      },
    },
  ]);
  await runJob(job);
  expect(await processes.listRuns(ADMIN, key)).toEqual(runs);
});

test("the same event starts its in-transaction process before its after-commit process", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const immediate = await seedProcess(orm, {
    key: "welcome_now",
    definition: eventProcess("employees.added"),
  });
  const deferred = await seedProcess(orm, {
    key: "welcome_later",
    definition: afterCommitProcess("employees.added"),
  });
  const { transact, queuedJobs, runJob } = afterCommitProcesses(orm, { today });
  const processes = processService(orm);

  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: [employee.id] });
    return Promise.resolve();
  });

  expect(await processes.listRuns(ADMIN, immediate.key)).toHaveLength(1);
  expect(await processes.listRuns(ADMIN, deferred.key)).toEqual([]);
  expect(queuedJobs).toHaveLength(1);
  await runJob(queuedJobs[0]!);
  expect(await processes.listRuns(ADMIN, deferred.key)).toHaveLength(1);
  expect(await processes.listRuns(ADMIN, immediate.key)).toHaveLength(1);
});

test("an event that does not match when queues no job", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: employee.id, askedByEmployeeId: employee.id });
  await seedProcess(orm, {
    key: "follow_up",
    definition: afterCommitProcess("tasks.task_status_changed", { field: "to", in: ["done"] }),
  });
  const { transact, queuedJobs } = afterCommitProcesses(orm, { today });

  await transact((tx) => {
    tx.publish("tasks.task_status_changed", {
      taskId: task.id,
      from: "to_do",
      to: "cancelled",
      byEmployeeId: employee.id,
    });
    return Promise.resolve();
  });

  expect(queuedJobs).toEqual([]);
});

test("a record gone when the job runs gets no run", async ({ orm }) => {
  const { key } = await seedProcess(orm, {
    key: "welcome",
    definition: afterCommitProcess("employees.added"),
  });
  const { transact, queuedJobs, runJob } = afterCommitProcesses(orm, { today });
  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: ["00000000-0000-4000-8000-000000000001"] });
    return Promise.resolve();
  });
  expect(queuedJobs).toHaveLength(1);

  await runJob(queuedJobs[0]!);

  expect(await processService(orm).listRuns(ADMIN, key)).toEqual([]);
});

test("a process turned off before its job runs starts no run", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const { key } = await seedProcess(orm, {
    key: "welcome",
    definition: afterCommitProcess("employees.added"),
  });
  const { transact, queuedJobs, runJob } = afterCommitProcesses(orm, { today });
  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: [employee.id] });
    return Promise.resolve();
  });
  expect(queuedJobs).toHaveLength(1);
  const processes = processService(orm, { today, transact });
  await processes.turnOff(ADMIN, key);

  await runJob(queuedJobs[0]!);

  expect(await processes.listRuns(ADMIN, key)).toEqual([]);
});

test("a job runs its carried version after a second version becomes active", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const definition = afterCommitProcess("employees.added");
  definition.steps[0]!.task.title = "Welcome from the first version";
  const { id, key } = await seedProcess(orm, { key: "welcome", definition });
  const { transact, queuedJobs, runJob } = afterCommitProcesses(orm, { today });
  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: [employee.id] });
    return Promise.resolve();
  });
  expect(queuedJobs).toHaveLength(1);
  const secondDefinition = afterCommitProcess("employees.added");
  secondDefinition.steps[0]!.task.title = "Welcome from the second version";
  const secondVersion = await seedSecondProcessVersion(orm, {
    processId: id,
    definition: secondDefinition,
  });
  const processes = processService(orm);
  expect((await processes.listProcesses(ADMIN)).find((process) => process.id === id)).toMatchObject(
    {
      activeVersion: { id: secondVersion.id, version: 2 },
    },
  );
  expect(queuedJobs[0]!.versionId).not.toBe(secondVersion.id);

  await runJob(queuedJobs[0]!);

  const runs = await processes.listRuns(ADMIN, key);
  expect(runs).toHaveLength(1);
  expect((await processes.readRun(ADMIN, runs[0]!.id)).steps).toMatchObject([
    { title: "Welcome from the first version" },
  ]);
});

test("a process that triggers itself stops after ten hops and keeps all ten runs", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: employee.id,
    askedByEmployeeId: employee.id,
    subjectEmployeeId: employee.id,
  });
  const { key } = await seedProcess(orm, {
    key: "follow_up",
    definition: afterCommitProcess("tasks.task_created"),
  });
  const { transact, queuedJobs, runJob } = afterCommitProcesses(orm, { today });
  await transact((tx) => {
    tx.publish("tasks.task_created", {
      taskId: task.id,
      type: "manual_to_do",
      assigneeEmployeeId: employee.id,
      askedByEmployeeId: employee.id,
      subjectEmployeeId: employee.id,
      sourceKey: null,
      byEmployeeId: employee.id,
    });
    return Promise.resolve();
  });

  for (let hop = 1; hop <= 10; hop += 1) {
    expect(queuedJobs).toHaveLength(1);
    const job = queuedJobs.shift()!;
    expect(job.hop).toBe(hop);
    await runJob(job);
  }

  expect(queuedJobs).toEqual([]);
  expect(await processService(orm).listRuns(ADMIN, key)).toHaveLength(10);
});

const today = () => calendarDate("2026-12-03");
