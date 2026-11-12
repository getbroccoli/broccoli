import {
  domainEvents,
  employeeServices,
  expect,
  OWNER,
  signedIn,
  taskService,
  test,
} from "#test/support";

test("creates a task needing its assignee and awaited by its asker", async ({
  orm,
  seed,
  transact,
}) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const assigneeCtx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const askerCtx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const task = await transact((tx) =>
    tasks.createTask(askerCtx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: assignee.id,
      askedByEmployeeId: asker.id,
    }),
  );

  expect(task).toMatchObject({
    status: "to_do",
    doneAt: null,
    doneByEmployeeId: null,
    cancelledAt: null,
    cancelReason: null,
  });
  expect(await tasks.listMyTasks(assigneeCtx)).toEqual({
    needsYou: [task],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
  expect(await tasks.listMyTasks(askerCtx)).toEqual({
    needsYou: [],
    waitingOnOthers: [task],
    resolvedRecently: [],
  });
});

test("trims the title and description of a new task", async ({ orm, seed, transact }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const tasks = taskService(orm);
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });

  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "  Read the handbook  ",
      description: "  Read before Monday.  ",
      assigneeEmployeeId: assignee.id,
      askedByEmployeeId: asker.id,
    }),
  );

  expect(await tasks.readTask(ctx, task.id)).toMatchObject({
    title: "Read the handbook",
    description: "Read before Monday.",
  });
});

test("stores a blank task description as null", async ({ orm, seed, transact }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const tasks = taskService(orm);
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });

  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      description: " \n\t ",
      assigneeEmployeeId: assignee.id,
      askedByEmployeeId: asker.id,
    }),
  );

  expect((await tasks.readTask(ctx, task.id)).description).toBeNull();
});

test("refuses a blank title without creating a task", async ({ orm, seed, transact }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const tasks = taskService(orm);
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });

  await expect(
    transact((tx) =>
      tasks.createTask(ctx, tx, {
        type: "manual_to_do",
        title: " \n\t ",
        assigneeEmployeeId: assignee.id,
        askedByEmployeeId: asker.id,
      }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "title", code: "required" }],
  });
  expect(await tasks.listMyTasks(ctx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
});

test("shows a process task without an asker only to its assignee", async ({
  orm,
  seed,
  transact,
}) => {
  const assignee = await seed.employee();
  const about = await seed.employee();
  const assigneeCtx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const aboutCtx = signedIn(orm, { employeeId: about.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);
  const processSource = { processKey: "onboarding", processRunId: null, stepKey: "read_handbook" };

  const task = await transact((tx) =>
    tasks.createTask(assigneeCtx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: assignee.id,
      subjectEmployeeId: about.id,
      processSource,
    }),
  );

  expect(task).toMatchObject({ askedByEmployeeId: null, processSource });
  expect(await tasks.listMyTasks(assigneeCtx)).toEqual({
    needsYou: [task],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
  expect(await tasks.listMyTasks(aboutCtx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
});

test("moves a task into its assignee's waiting on others group", async ({
  orm,
  seed,
  transact,
}) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const waiting = await transact((tx) => tasks.markWaiting(ctx, tx, task.id));

  expect(waiting.status).toBe("waiting");
  expect(await tasks.listMyTasks(ctx)).toEqual({
    needsYou: [],
    waitingOnOthers: [waiting],
    resolvedRecently: [],
  });
});

test("deletes a person's held tasks when the person is deleted", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: assignee.id, askedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);

  await employeeServices(orm).deleteEmployee(OWNER, { id: assignee.id });

  await expect(tasks.readTask(ctx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("publishes the created task's ids and the person who created it", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const subject = await seed.employee();
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const { transact, events } = domainEvents(orm);
  const tasks = taskService(orm, { transact });

  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: assignee.id,
      askedByEmployeeId: asker.id,
      subjectEmployeeId: subject.id,
      processSource: { processKey: "onboarding", processRunId: null, stepKey: "handbook" },
    }),
  );

  expect(events).toEqual([
    {
      type: "tasks.task_created",
      payload: {
        taskId: task.id,
        assigneeEmployeeId: assignee.id,
        askedByEmployeeId: asker.id,
        subjectEmployeeId: subject.id,
        processKey: "onboarding",
        byEmployeeId: asker.id,
      },
    },
  ]);
});

test("returns bulk-created tasks in input order and publishes each task", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const { transact, events } = domainEvents(orm);
  const tasks = taskService(orm, { transact });

  const created = await transact((tx) =>
    tasks.createTasks(ctx, tx, [
      {
        type: "manual_to_do",
        title: "Read the handbook",
        assigneeEmployeeId: assignee.id,
        askedByEmployeeId: asker.id,
      },
      {
        type: "manual_to_do",
        title: "Arrange a meeting",
        assigneeEmployeeId: asker.id,
        askedByEmployeeId: asker.id,
      },
    ]),
  );

  expect(created.map(({ title }) => title)).toEqual(["Read the handbook", "Arrange a meeting"]);
  expect(created[0]!.id).not.toBe(created[1]!.id);
  expect(events).toEqual(
    created.map((task) => ({
      type: "tasks.task_created",
      payload: {
        taskId: task.id,
        assigneeEmployeeId: task.assigneeEmployeeId,
        askedByEmployeeId: asker.id,
        subjectEmployeeId: null,
        processKey: null,
        byEmployeeId: asker.id,
      },
    })),
  );
});
