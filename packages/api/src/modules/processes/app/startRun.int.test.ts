import {
  ADMIN,
  EMPLOYEE,
  calendarDate,
  expect,
  processService,
  seedOwnWeek,
  seedWorkingPattern,
  signedIn,
  taskService,
  test,
} from "#test/support";

import { WELCOME_NEW_STARTER } from "../domain";

test("an admin starts two parallel tasks with their assignees, source and due dates", async ({
  orm,
  seed,
}) => {
  const admin = await seed.employee();
  const manager = await seed.employee();
  const sam = await seed.employee({ firstName: "Sam", startDate: "2026-12-03" });
  await seed.manager(sam.id, manager.id);
  const ctx = signedIn(orm, { employeeId: admin.id, profiles: ["ADMIN"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const details = await processes.startRun(ctx, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: sam.id,
  });

  expect(details.run).toMatchObject({
    processKey: WELCOME_NEW_STARTER,
    subjectEmployeeId: sam.id,
    record: { recordType: "employee", recordId: sam.id },
    startCause: "started_by_admin",
    startedByEmployeeId: admin.id,
    startDay: "2026-12-03",
    status: "in_progress",
  });
  expect(details.steps).toMatchObject([
    {
      key: "welcome_one_to_one",
      title: "Have a welcome 1:1 with Sam",
      status: "step_awaiting_task_completion",
      task: { assigneeEmployeeId: manager.id, dueDate: "2026-12-03", status: "to_do" },
    },
    {
      key: "coffee_calls",
      status: "step_awaiting_task_completion",
      task: { assigneeEmployeeId: sam.id, dueDate: "2026-12-10", status: "to_do" },
    },
  ]);
  const tasks = taskService(orm);
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const samCtx = signedIn(orm, { employeeId: sam.id, profiles: ["EMPLOYEE"] });
  expect(await tasks.readTask(managerCtx, details.steps[0]!.task!.id)).toMatchObject({
    type: "process_step_to_do",
    askedByEmployeeId: null,
    subjectEmployeeId: sam.id,
    record: { recordType: "employee", recordId: sam.id },
    processSource: {
      processKey: WELCOME_NEW_STARTER,
      processRunId: details.run.id,
      stepKey: "welcome_one_to_one",
    },
  });
  expect(await tasks.readTask(samCtx, details.steps[1]!.task!.id)).toMatchObject({
    type: "process_step_to_do",
    askedByEmployeeId: null,
    subjectEmployeeId: sam.id,
    record: { recordType: "employee", recordId: sam.id },
    processSource: {
      processKey: WELCOME_NEW_STARTER,
      processRunId: details.run.id,
      stepKey: "coffee_calls",
    },
  });
});

test("tasks from an admin's welcome are authored by Broccoli with the run as cause", async ({
  orm,
  seed,
}) => {
  const admin = await seed.employee();
  const employee = await seed.employee();
  const adminCtx = signedIn(orm, { employeeId: admin.id, profiles: ["ADMIN"] });
  const assigneeCtx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const started = await processes.startRun(adminCtx, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  const history = await taskService(orm).readTaskHistory(assigneeCtx, started.steps[1]!.task!.id, {
    first: 10,
  });
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      operation: "CREATED",
      author: { kind: "BROCCOLI_ITSELF" },
      cause: { kind: "PROCESS_RUN", ref: started.run.id },
    },
  ]);
});

test("an early manual welcome uses the person's future start day and manager", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee({ startDate: "2026-12-10" });
  await seed.manager(employee.id, manager.id);
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const details = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  expect(details.run.startDay).toBe("2026-12-10");
  expect(details.steps[0]!.task).toMatchObject({
    assigneeEmployeeId: manager.id,
    dueDate: "2026-12-10",
  });
  expect(details.steps[1]!.task!.dueDate).toBe("2026-12-17");
});

test("the owner's employee covers a missing manager with an explanation", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const ownerEmployee = await seed.employee({ userId: owner.user!.userId });
  const employee = await seed.employee();
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const details = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  expect(details.steps[0]).toMatchObject({
    key: "welcome_one_to_one",
    status: "step_awaiting_task_completion",
    assigneeNote: "assignee_is_owner_because_subject_has_no_manager",
    task: { assigneeEmployeeId: ownerEmployee.id },
  });
});

test("skips the welcome meeting when neither a manager nor an owner employee exists", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  const employee = await seed.employee();
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const details = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  expect(details.steps[0]).toMatchObject({
    status: "step_skipped",
    skipReason: "no_assignee_for_step",
    task: null,
    finishedAt: expect.any(Date) as unknown,
  });
  expect(details.run.status).toBe("in_progress");
  expect(details.steps[1]!.task!.assigneeEmployeeId).toBe(employee.id);
});

test("refuses a second welcome while the first is in progress", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Sam" });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  await processes.startRun(ADMIN, { processKey: WELCOME_NEW_STARTER, employeeId: employee.id });

  await expect(
    processes.startRun(ADMIN, { processKey: WELCOME_NEW_STARTER, employeeId: employee.id }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Welcome a new starter is already running for Sam.",
  });
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toHaveLength(1);
});

test("allows another manual welcome after cancellation", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const first = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  await processes.cancelRun(ADMIN, first.run.id, "Start again");

  const next = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  expect(next.run.id).not.toBe(first.run.id);
  expect(next.run.status).toBe("in_progress");
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toHaveLength(2);
});

test("allows a manual welcome while automatic starts are off", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const details = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  expect(details.run.status).toBe("in_progress");
  expect((await processes.listProcesses(ADMIN))[0]!.isOn).toBe(false);
});

test("refuses a manual welcome without a create grant", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(
    processService(orm).startRun(EMPLOYEE, {
      processKey: WELCOME_NEW_STARTER,
      employeeId: employee.id,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("refuses a due date beyond the bank holiday data without leaving a run or tasks", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2028-12-28" });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2028-12-28") });

  await expect(
    processes.startRun(ADMIN, { processKey: WELCOME_NEW_STARTER, employeeId: employee.id }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "No bank holidays are known for 2029.",
  });
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toEqual([]);
  expect((await taskService(orm).listMyTasks(ctx)).needsYou).toEqual([]);
});

test("counts the subject's own part-time working days for coffee calls", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const pattern = await seedWorkingPattern(orm, { minutes: [450, 0, 0, 450, 0, 0, 0] });
  await seedOwnWeek(orm, {
    employeeId: employee.id,
    versionId: pattern.versionId,
    startDate: "2026-01-01",
  });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const details = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  expect(details.steps[1]!.task!.dueDate).toBe("2026-12-21");
});

test("uses calendar days for a person without a working pattern", async ({ orm, seed }) => {
  const employee = await seed.employee();
  await seed.leaveTerms(employee.id);
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const details = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  expect(details.steps[1]!.task!.dueDate).toBe("2026-12-08");
});
