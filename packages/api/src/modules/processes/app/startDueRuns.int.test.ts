import {
  ADMIN,
  EMPLOYEE,
  SYSTEM,
  calendarDate,
  employeeServices,
  expect,
  processService,
  test,
} from "#test/support";

import { WELCOME_NEW_STARTER } from "../domain";

test("starts a welcome on the new starter's date only once", async ({ orm, seed }) => {
  let today = calendarDate("2026-12-02");
  const processes = processService(orm, { today: () => today });
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  const employee = await seed.employee({ startDate: "2026-12-03" });
  today = calendarDate("2026-12-03");

  expect(await processes.startDueRuns(SYSTEM, today)).toEqual({ runsStarted: 1, runsCancelled: 0 });
  expect(await processes.startDueRuns(SYSTEM, today)).toEqual({ runsStarted: 0, runsCancelled: 0 });
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toMatchObject([
    {
      subjectEmployeeId: employee.id,
      startDay: "2026-12-03",
      startCause: "started_on_record_date",
    },
  ]);
});

test("catches up two days late with the meeting due today", async ({ orm, seed }) => {
  let today = calendarDate("2026-12-01");
  const processes = processService(orm, { today: () => today });
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  const manager = await seed.employee();
  const employee = await seed.employee({ startDate: "2026-12-01" });
  await seed.manager(employee.id, manager.id);
  today = calendarDate("2026-12-03");

  expect(await processes.startDueRuns(SYSTEM, today)).toMatchObject({ runsStarted: 1 });

  const [run] = await processes.listRuns(ADMIN, WELCOME_NEW_STARTER);
  const details = await processes.readRun(ADMIN, run!.id);
  expect(details.run.startDay).toBe("2026-12-03");
  expect(details.steps[0]!.task!.dueDate).toBe("2026-12-03");
});

test("does not catch up a starter more than seven days late", async ({ orm, seed }) => {
  let today = calendarDate("2026-11-20");
  const processes = processService(orm, { today: () => today });
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  await seed.employee({ startDate: "2026-11-25" });
  today = calendarDate("2026-12-03");

  expect(await processes.startDueRuns(SYSTEM, today)).toEqual({ runsStarted: 0, runsCancelled: 0 });
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toEqual([]);
});

test("does not start automatically after a cancelled manual welcome", async ({ orm, seed }) => {
  const today = calendarDate("2026-12-03");
  const processes = processService(orm, { today: () => today });
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  const employee = await seed.employee({ startDate: today });
  const manual = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  await processes.cancelRun(ADMIN, manual.run.id, "Already welcomed");

  expect(await processes.startDueRuns(SYSTEM, today)).toEqual({ runsStarted: 0, runsCancelled: 0 });
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toMatchObject([
    { id: manual.run.id, status: "cancelled" },
  ]);
});

test("does not start welcomes while automatic starts are off", async ({ orm, seed }) => {
  const today = calendarDate("2026-12-03");
  await seed.employee({ startDate: today });
  const processes = processService(orm, { today: () => today });

  expect(await processes.startDueRuns(SYSTEM, today)).toEqual({ runsStarted: 0, runsCancelled: 0 });
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toEqual([]);
});

test("does not catch up a start date before the process was turned on", async ({ orm, seed }) => {
  const today = calendarDate("2026-12-03");
  const processes = processService(orm, { today: () => today });
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  await seed.employee({ startDate: "2026-12-02" });

  expect(await processes.startDueRuns(SYSTEM, today)).toEqual({ runsStarted: 0, runsCancelled: 0 });
  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toEqual([]);
});

test("the daily pass cancels a run whose outstanding assignee was removed even while off", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const today = calendarDate("2026-12-03");
  const processes = processService(orm, { today: () => today });
  const started = await processes.startRun(ADMIN, {
    processKey: WELCOME_NEW_STARTER,
    employeeId: employee.id,
  });
  await employeeServices(orm).deleteEmployee(ADMIN, { id: manager.id });
  expect((await processes.readRun(ADMIN, started.run.id)).run.status).toBe("in_progress");

  expect(await processes.startDueRuns(SYSTEM, today)).toEqual({ runsStarted: 0, runsCancelled: 1 });

  const cancelled = await processes.readRun(ADMIN, started.run.id);
  expect(cancelled.run).toMatchObject({
    status: "cancelled",
    cancelCause: "cancelled_because_step_assignee_was_removed",
  });
  expect(cancelled.steps[1]!.task!.status).toBe("cancelled");
});

test("only the system may run the daily pass", async ({ orm }) => {
  const processes = processService(orm);

  await expect(processes.startDueRuns(ADMIN, calendarDate("2026-12-03"))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(processes.startDueRuns(EMPLOYEE, calendarDate("2026-12-03"))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
