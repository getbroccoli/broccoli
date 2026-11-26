import {
  ADMIN,
  EMPLOYEE,
  approvalParticipants,
  createApprovalService,
  approvalRequest,
  approvalToday,
  calendarDate,
  eventProcess,
  seedProcess,
  transactWithApprovals,
  transactWithProcesses,
  expect,
  processService,
  notificationFlow,
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
    recordId: firstPerson.id,
  });
  const second = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    recordId: secondPerson.id,
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
    recordId: employee.id,
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
    recordId: employee.id,
  });

  const coffee = started.steps[1]!.task!.id;
  const meeting = started.steps[0]!.task!.id;
  const progress = await processes.readStepProgress(ctx, [coffee, meeting]);
  expect([...progress.keys()]).toEqual([coffee]);
  expect(progress.get(coffee)).toEqual({
    endedAt: null,
    decidesOutcome: false,
    outcome: null,
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
    recordId: employee.id,
  });
  const taskId = started.steps[1]!.task!.id;

  expect(await processes.readStepProgress(ctx, [taskId])).toEqual(new Map());
  await expect(taskService(orm).markDone(ctx, taskId)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("leaves out a task no process created", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const task = await seed.task({ assigneeEmployeeId: employee.id });

  expect(await processService(orm).readStepProgress(ctx, [task.id])).toEqual(new Map());
});

test("shows the outcome step's decision to its assignee and its asker", async ({ orm, seed }) => {
  const { sam, mia, manager, requester } = await approvalParticipants(orm, seed);
  const transact = transactWithApprovals(orm, { today: approvalToday });
  await transact((tx) =>
    createApprovalService().requestApproval(requester, tx, approvalRequest(sam.id)),
  );
  const tasks = taskService(orm, { transact });
  const {
    needsYou: [task],
  } = await tasks.listMyTasks(manager);
  const result = { code: "rejected", comment: "Clashes with the release week." };
  await tasks.markDone(manager, task!.id, { result });

  const processes = processService(orm);
  for (const reader of [manager, requester]) {
    const progress = await processes.readStepProgress(reader, [task!.id]);
    expect(progress.get(task!.id)).toMatchObject({
      status: "finished",
      endedAt: expect.any(Date) as unknown,
      decidesOutcome: true,
      outcome: {
        ...result,
        label: "Rejected",
        byEmployeeId: mia.id,
        at: expect.any(Date) as unknown,
      },
    });
  }
});

test("shows no outcome on another task of a run that has an outcome", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const definition = eventProcess("employees.added");
  const followUp = definition.steps[0]!;
  const decide = {
    ...followUp,
    key: "decide",
    task: {
      ...followUp.task,
      resultForm: {
        kind: "choice" as const,
        options: [
          { code: "yes", label: "Yes" },
          { code: "no", label: "No" },
        ],
      },
    },
  };
  const { key } = await seedProcess(orm, {
    key: "review",
    definition: {
      ...definition,
      steps: [decide, followUp],
      outcome: { step: "decide" },
    },
  });
  const transact = transactWithProcesses(orm, { today: approvalToday });
  const processes = processService(orm, { today: approvalToday, transact });
  const tasks = taskService(orm, { transact });
  const run = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const decisionId = run.steps[0]!.task!.id;
  const followUpId = run.steps[1]!.task!.id;
  await tasks.markDone(ctx, decisionId, { result: { code: "no", comment: "Private reason" } });
  await tasks.markDone(ctx, followUpId);

  const progress = await processes.readStepProgress(ctx, [decisionId, followUpId]);

  expect(progress.get(decisionId)?.outcome).toMatchObject({
    label: "No",
    comment: "Private reason",
  });
  expect(progress.get(followUpId)).toMatchObject({
    status: "finished",
    decidesOutcome: false,
    outcome: null,
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

// The tasks go with the people: every path that resets processes deletes the employees first.
test("reset removes runs, turns built-in processes on and other processes off", async ({
  orm,
  seed,
  transact,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  await processes.startRun(ADMIN, { processKey: WELCOME_NEW_STARTER, recordId: employee.id });

  const notifications = notificationFlow(orm, { today: () => calendarDate("2026-12-03") });
  await notifications.processes.turnOff(ADMIN, "notifications.task_created");
  await notifications.processes.turnOff(ADMIN, "notifications.task_done");

  await transact((tx) => processes.resetProcesses(ADMIN, tx));

  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toEqual([]);
  const reset = await notifications.processes.listProcesses(ADMIN);
  expect(reset.filter(({ key }) => key.startsWith("notifications."))).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "notifications.task_created", isOn: true }),
      expect.objectContaining({ key: "notifications.task_done", isOn: true }),
    ]),
  );
  expect(reset.find(({ key }) => key === WELCOME_NEW_STARTER)).toMatchObject({ turnedOnAt: null });
});
