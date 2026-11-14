import {
  ADMIN,
  calendarDate,
  expect,
  processService,
  signedIn,
  taskService,
  test,
} from "#test/support";

import { WELCOME_NEW_STARTER } from "../domain";

test("an admin cancels open tasks with the reason and preserves completed steps", async ({
  orm,
  seed,
}) => {
  const admin = await seed.employee();
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const adminCtx = signedIn(orm, { employeeId: admin.id, profiles: ["ADMIN"] });
  const managerCtx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const employeeCtx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(adminCtx, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  await processes.markStepDone(managerCtx, started.steps[0]!.task!.id);

  const cancelled = await processes.cancelRun(adminCtx, started.run.id, "  No longer needed  ");

  expect(cancelled.run).toMatchObject({
    status: "cancelled",
    cancelledAt: expect.any(Date) as unknown,
    cancelledByEmployeeId: admin.id,
    cancelCause: "cancelled_by_admin",
    cancelReason: "No longer needed",
  });
  expect(cancelled.steps).toMatchObject([
    { status: "step_completed", task: { status: "done" } },
    { status: "step_cancelled", task: { status: "cancelled" } },
  ]);
  expect(await taskService(orm).readTask(employeeCtx, started.steps[1]!.task!.id)).toMatchObject({
    status: "cancelled",
    cancelReason: "No longer needed",
  });
  expect((await processes.readRun(ADMIN, started.run.id)).run).toEqual(cancelled.run);
});

test("refuses a blank cancellation reason without changing the run", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  await expect(processes.cancelRun(ADMIN, started.run.id, " \n\t ")).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "reason", code: "required" }],
  });
  expect(await processes.readRun(ADMIN, started.run.id)).toEqual(started);
});

test("refuses cancellation of a finished run", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  await processes.markStepDone(ctx, started.steps[1]!.task!.id);

  await expect(
    processes.cancelRun(ADMIN, started.run.id, "No longer needed"),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Only a run in progress can be cancelled.",
  });
});

test("generic task cancellation refuses process tasks", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });

  await expect(
    taskService(orm).cancel(ctx, started.steps[1]!.task!.id, "No longer needed"),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This task belongs to a process.",
  });
  expect((await processes.readRun(ADMIN, started.run.id)).run.status).toBe("in_progress");
});
