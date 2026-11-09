import { employeeServices, expect, OWNER, signedIn, taskService, test } from "#test/support";

test("creates a task needing its holder and awaited by its asker", async ({
  orm,
  seed,
  transact,
}) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const holderCtx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const askerCtx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);

  const task = await transact((tx) =>
    tasks.createTask(askerCtx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: holder.id,
      requestedByEmployeeId: asker.id,
    }),
  );

  expect(task).toMatchObject({
    status: "to_do",
    doneAt: null,
    doneByEmployeeId: null,
    cancelledAt: null,
    cancelReason: null,
  });
  expect(await tasks.listMyTasks(holderCtx)).toEqual({
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
  const holder = await seed.employee();
  const asker = await seed.employee();
  const tasks = taskService(orm);
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });

  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "  Read the handbook  ",
      description: "  Read before Monday.  ",
      assigneeEmployeeId: holder.id,
      requestedByEmployeeId: asker.id,
    }),
  );

  expect(await tasks.readTask(ctx, task.id)).toMatchObject({
    title: "Read the handbook",
    description: "Read before Monday.",
  });
});

test("stores a blank task description as null", async ({ orm, seed, transact }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const tasks = taskService(orm);
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });

  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      description: " \n\t ",
      assigneeEmployeeId: holder.id,
      requestedByEmployeeId: asker.id,
    }),
  );

  expect((await tasks.readTask(ctx, task.id)).description).toBeNull();
});

test("refuses a blank title without creating a task", async ({ orm, seed, transact }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const tasks = taskService(orm);
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });

  await expect(
    transact((tx) =>
      tasks.createTask(ctx, tx, {
        type: "manual_to_do",
        title: " \n\t ",
        assigneeEmployeeId: holder.id,
        requestedByEmployeeId: asker.id,
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

test("shows a process task without an asker only to its holder", async ({
  orm,
  seed,
  transact,
}) => {
  const holder = await seed.employee();
  const about = await seed.employee();
  const holderCtx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const aboutCtx = signedIn(orm, { employeeId: about.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);
  const processSource = { processKey: "onboarding", processRunId: null, stepKey: "read_handbook" };

  const task = await transact((tx) =>
    tasks.createTask(holderCtx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: holder.id,
      aboutEmployeeId: about.id,
      processSource,
    }),
  );

  expect(task).toMatchObject({ requestedByEmployeeId: null, processSource });
  expect(await tasks.listMyTasks(holderCtx)).toEqual({
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

test("moves a task into its holder's waiting on others group", async ({ orm, seed, transact }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
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
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const tasks = taskService(orm);
  expect(await tasks.readTask(ctx, task.id)).toEqual(task);

  await employeeServices(orm).deleteEmployee(OWNER, { id: holder.id });

  await expect(tasks.readTask(ctx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});
