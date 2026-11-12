import { assert, onTestFinished, vi } from "vitest";

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
  eventProcess,
} from "#test/support";

test("adding a person commits exactly one process run and a task for their manager", async ({
  orm,
  seed,
}) => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-12-03T12:00:00Z") });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const manager = await seed.employee();
  const definition = eventProcess("employees.added");
  definition.steps[0]!.assignee = { kind: "subjects_manager" };
  const { key } = await seed.process({ key: "welcome", definition });
  const transact = transactWithProcesses(orm, { today });

  const employee = await transact(async (tx) => {
    const employees = employeeServices(orm, { transact: (work) => work(tx) });
    const added = await employees.createEmployee(ADMIN, {
      firstName: "Sam",
      lastName: "New",
      email: "sam@example.com",
    });
    assert(added);
    await employees.setManagers(ADMIN, { employeeIds: [added.id], managerId: manager.id });
    return added;
  });

  expect(await employeeServices(orm).readEmployee(ADMIN, employee.id)).toEqual(employee);
  expect(await processService(orm).listRuns(ADMIN, key)).toMatchObject([
    {
      startCause: "started_on_event",
      startDay: "2026-12-03",
      subjectEmployeeId: employee.id,
      triggerEvent: {
        type: "employees.added",
        payload: { employeeIds: [employee.id] },
      },
      record: { recordType: "employee", recordId: employee.id },
    },
  ]);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  expect((await taskService(orm).listMyTasks(ctx)).needsYou).toMatchObject([
    {
      subjectEmployeeId: employee.id,
      processSource: { processKey: key },
    },
  ]);
});

test("a failed transaction leaves no event-started run", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const { key } = await seed.process({
    key: "welcome",
    definition: eventProcess("employees.added"),
  });
  const transact = transactWithProcesses(orm, { today });

  await expect(
    transact((tx) => {
      tx.publish("employees.added", { employeeIds: [employee.id] });
      throw new Error("Save failed");
    }),
  ).rejects.toThrow("Save failed");

  expect(await processService(orm).listRuns(ADMIN, key)).toEqual([]);
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  expect((await taskService(orm).listMyTasks(ctx)).needsYou).toEqual([]);
});

test("one event for three people starts three runs", async ({ orm, seed }) => {
  const people = await seed.employees(3);
  const ids = people.map(({ id }) => id);
  const { key } = await seed.process({
    key: "welcome",
    definition: eventProcess("employees.added"),
  });
  const transact = transactWithProcesses(orm, { today });

  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: ids });
    return Promise.resolve();
  });

  const runs = await processService(orm).listRuns(ADMIN, key);
  expect(runs.map(({ record }) => record.recordId).sort()).toEqual([...ids].sort());
  expect(new Set(runs.map(({ triggerEvent }) => triggerEvent!.id)).size).toBe(1);
  for (const run of runs) {
    expect(run.triggerEvent!.type).toBe("employees.added");
    expect(run.triggerEvent!.payload).toEqual({ employeeIds: [run.record.recordId] });
  }
});

test("three events in one transaction start three runs", async ({ orm, seed }) => {
  const people = await seed.employees(3);
  const ids = people.map(({ id }) => id);
  const { key } = await seed.process({
    key: "welcome",
    definition: eventProcess("employees.added"),
  });
  const transact = transactWithProcesses(orm, { today });

  await transact((tx) => {
    for (const id of ids) tx.publish("employees.added", { employeeIds: [id] });
    return Promise.resolve();
  });

  const runs = await processService(orm).listRuns(ADMIN, key);
  expect(runs.map(({ record }) => record.recordId).sort()).toEqual([...ids].sort());
  expect(new Set(runs.map(({ triggerEvent }) => triggerEvent!.id)).size).toBe(3);
});

test("a run that cannot calculate its due date rolls back adding the person", async ({
  orm,
  seed,
}) => {
  const definition = eventProcess("employees.added");
  definition.steps[0]!.due = { amount: 1, unit: "business_days" };
  const { key } = await seed.process({ key: "welcome", definition });
  const transact = transactWithProcesses(orm, { today: () => calendarDate("2031-06-02") });
  const employees = employeeServices(orm, { transact });

  await expect(
    employees.createEmployee(ADMIN, {
      firstName: "Sam",
      lastName: "New",
      email: "sam@example.com",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "No bank holidays are known for 2031." });

  expect((await employees.listEmployees(ADMIN, {})).edges).toEqual([]);
  expect(await processService(orm).listRuns(ADMIN, key)).toEqual([]);
});

test("an off process starts nothing when its event happens", async ({ orm, seed }) => {
  const { key } = await seed.process({
    key: "welcome",
    definition: eventProcess("employees.added"),
    turnedOn: false,
  });
  const transact = transactWithProcesses(orm, { today });

  await employeeServices(orm, { transact }).createEmployee(ADMIN, {
    firstName: "Sam",
    lastName: "New",
    email: "sam@example.com",
  });

  expect(await processService(orm).listRuns(ADMIN, key)).toEqual([]);
});

test("an unmatched event condition starts nothing", async ({ orm, seed }) => {
  const definition = eventProcess("employees.added", { field: "source", in: ["import"] });
  const { key } = await seed.process({ key: "welcome", definition });
  const transact = transactWithProcesses(orm, { today });

  await employeeServices(orm, { transact }).createEmployee(ADMIN, {
    firstName: "Sam",
    lastName: "New",
    email: "sam@example.com",
  });

  expect(await processService(orm).listRuns(ADMIN, key)).toEqual([]);
});

test("marking a task done starts a process carrying the person who acted", async ({
  orm,
  seed,
}) => {
  const assignee = await seed.employee();
  const subject = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: assignee.id,
    subjectEmployeeId: subject.id,
  });
  const definition = eventProcess("tasks.task_status_changed", {
    field: "to",
    in: ["done", "cancelled"],
  });
  const { key } = await seed.process({ key: "follow_up", definition });
  const transact = transactWithProcesses(orm, { today });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });

  await taskService(orm, { transact }).markDone(ctx, task.id);

  expect(await processService(orm).listRuns(ADMIN, key)).toMatchObject([
    {
      startCause: "started_on_event",
      subjectEmployeeId: subject.id,
      record: { recordType: "task", recordId: task.id },
      triggerEvent: {
        type: "tasks.task_status_changed",
        payload: {
          taskId: task.id,
          from: "to_do",
          to: "done",
          byEmployeeId: assignee.id,
        },
      },
    },
  ]);
});

test("marking a task waiting does not start a done-or-cancelled process", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: assignee.id });
  const definition = eventProcess("tasks.task_status_changed", {
    field: "to",
    in: ["done", "cancelled"],
  });
  const { key } = await seed.process({ key: "follow_up", definition });
  const transact = transactWithProcesses(orm, { today });
  const tasks = taskService(orm, { transact });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });

  await transact((tx) => tasks.markWaiting(ctx, tx, task.id));

  expect((await tasks.readTask(ctx, task.id)).status).toBe("waiting");
  expect(await processService(orm).listRuns(ADMIN, key)).toEqual([]);
});

test("a run's tasks start another process in the same transaction", async ({ orm, seed }) => {
  const first = await seed.process({ key: "welcome", definition: eventProcess("employees.added") });
  const definition = eventProcess("tasks.task_created", { field: "processKey", in: [first.key] });
  const second = await seed.process({ key: "follow_up", definition });
  const transact = transactWithProcesses(orm, { today });

  const added = await employeeServices(orm, { transact }).createEmployee(ADMIN, {
    firstName: "Sam",
    lastName: "New",
    email: "sam@example.com",
  });

  assert(added);
  const processes = processService(orm);
  const [run] = await processes.listRuns(ADMIN, first.key);
  const details = await processes.readRun(ADMIN, run!.id);
  const task = details.steps[0]!.task!;
  expect(await processes.listRuns(ADMIN, second.key)).toMatchObject([
    {
      subjectEmployeeId: added.id,
      record: { recordType: "task", recordId: task.id },
      triggerEvent: {
        type: "tasks.task_created",
        payload: { taskId: task.id, processKey: first.key },
      },
    },
  ]);
  const ctx = signedIn(orm, { employeeId: added.id, profiles: ["EMPLOYEE"] });
  expect((await taskService(orm).listMyTasks(ctx)).needsYou).toHaveLength(2);
});

test("two matching events start two runs when every step is skipped", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const definition = eventProcess("employees.added");
  definition.steps[0]!.assignee = { kind: "subjects_manager" };
  const { key } = await seed.process({ key: "welcome", definition });
  const transact = transactWithProcesses(orm, { today });

  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: [employee.id] });
    tx.publish("employees.added", { employeeIds: [employee.id] });
    return Promise.resolve();
  });

  const runs = await processService(orm).listRuns(ADMIN, key);
  expect(runs).toMatchObject([{ status: "finished" }, { status: "finished" }]);
  expect(runs[0]!.triggerEvent!.id).not.toBe(runs[1]!.triggerEvent!.id);
});

test("a matching event during a run in progress is skipped and the save commits", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const { key } = await seed.process({
    key: "welcome",
    definition: eventProcess("employees.added"),
  });
  const transact = transactWithProcesses(orm, { today });
  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: [employee.id] });
    return Promise.resolve();
  });
  const before = await processService(orm).listRuns(ADMIN, key);

  await transact(async (tx) => {
    await employeeServices(orm, { transact: (work) => work(tx) }).updateEmployee(ADMIN, {
      id: employee.id,
      jobTitle: "Engineer",
    });
    tx.publish("employees.added", { employeeIds: [employee.id] });
  });

  expect(await processService(orm).listRuns(ADMIN, key)).toEqual(before);
  expect(before).toMatchObject([{ status: "in_progress" }]);
  expect(await employeeServices(orm).readEmployee(ADMIN, employee.id)).toMatchObject({
    jobTitle: "Engineer",
  });
});

const today = () => calendarDate("2026-12-03");
