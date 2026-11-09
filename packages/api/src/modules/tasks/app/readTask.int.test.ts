import { EMPLOYEE, expect, signedIn, taskService, test } from "#test/support";

test("lets the holder read a task", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });

  expect(await taskService(orm).readTask(ctx, task.id)).toEqual(task);
});

test("lets the person who asked read a task", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const task = await seed.task({ assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id });
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });

  expect(await taskService(orm).readTask(ctx, task.id)).toEqual(task);
});

test.for(["EMPLOYEE", "ADMIN", "OWNER"] as const)(
  "hides a task from an unrelated %s",
  async (profile, { orm, seed }) => {
    const holder = await seed.employee();
    const asker = await seed.employee();
    const other = await seed.employee();
    const task = await seed.task({
      assigneeEmployeeId: holder.id,
      requestedByEmployeeId: asker.id,
    });
    const ctx = signedIn(orm, { employeeId: other.id, profiles: [profile] });

    await expect(taskService(orm).readTask(ctx, task.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No task has this id.",
    });
  },
);

test("does not give access to the person a task is about", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const about = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: holder.id,
    requestedByEmployeeId: asker.id,
    aboutEmployeeId: about.id,
  });
  const ctx = signedIn(orm, { employeeId: about.id, profiles: ["EMPLOYEE"] });

  await expect(taskService(orm).readTask(ctx, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("hides tasks from a caller without an employee", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const task = await seed.task({
    assigneeEmployeeId: holder.id,
    processSource: { processKey: "onboarding", processRunId: null, stepKey: "read_handbook" },
  });

  await expect(taskService(orm).readTask(EMPLOYEE, task.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});

test("reports an unknown task as not found", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  await expect(
    taskService(orm).readTask(ctx, "00000000-0000-4000-8000-000000000001"),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No task has this id.",
  });
});
