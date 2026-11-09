import { afterEach, beforeEach, vi } from "vitest";

import { calendarDate, EMPLOYEE, expect, signedIn, taskService, test } from "#test/support";

test("groups held tasks by status", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const people = { assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id };
  const toDo = await seed.task(people);
  const waiting = await seed.task({ ...people, status: "waiting" });
  const done = await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: holder.id,
  });
  const cancelled = await seed.task({
    ...people,
    status: "cancelled",
    cancelledAt: new Date("2026-11-07T12:00:00Z"),
    cancelReason: "No longer needed",
  });

  expect(await taskService(orm).listMyTasks(ctx)).toEqual({
    needsYou: [toDo],
    waitingOnOthers: [waiting],
    resolvedRecently: [done, cancelled],
  });
});

test("shows the asker's open tasks under waiting on others", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
  const people = { assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id };
  const waiting = await seed.task({ ...people, status: "waiting" });
  const toDo = await seed.task(people);
  const done = await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: holder.id,
  });
  const cancelled = await seed.task({
    ...people,
    status: "cancelled",
    cancelledAt: new Date("2026-11-07T12:00:00Z"),
    cancelReason: "No longer needed",
  });

  expect(await taskService(orm).listMyTasks(ctx)).toEqual({
    needsYou: [],
    waitingOnOthers: [waiting, toDo],
    resolvedRecently: [done, cancelled],
  });
});

test("lists a task once when the caller holds it and asked for it", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const people = { assigneeEmployeeId: employee.id, requestedByEmployeeId: employee.id };
  const toDo = await seed.task(people);
  const waiting = await seed.task({ ...people, status: "waiting" });
  const done = await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: employee.id,
  });
  const cancelled = await seed.task({
    ...people,
    status: "cancelled",
    cancelledAt: new Date("2026-11-07T12:00:00Z"),
    cancelReason: "No longer needed",
  });

  expect(await taskService(orm).listMyTasks(ctx)).toEqual({
    needsYou: [toDo],
    waitingOnOthers: [waiting],
    resolvedRecently: [done, cancelled],
  });
});

test("orders tasks needing the caller by due date then oldest first with undated tasks last", async ({
  orm,
  seed,
}) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const people = { assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id };
  const undated = await seed.task(people);
  const later = await seed.task({ ...people, dueDate: calendarDate("2026-11-12") });
  const earlier = await seed.task({ ...people, dueDate: calendarDate("2026-11-10") });
  const sameDate = await seed.task({ ...people, dueDate: calendarDate("2026-11-10") });
  const newerUndated = await seed.task(people);

  const tasks = await taskService(orm).listMyTasks(ctx);

  expect(tasks.needsYou.map(({ id }) => id)).toEqual([
    earlier.id,
    sameDate.id,
    later.id,
    undated.id,
    newerUndated.id,
  ]);
});

test("orders waiting tasks oldest first across tasks held and asked for", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const other = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
  const asked = await seed.task({
    assigneeEmployeeId: other.id,
    requestedByEmployeeId: employee.id,
    dueDate: calendarDate("2026-11-12"),
  });
  const held = await seed.task({
    assigneeEmployeeId: employee.id,
    requestedByEmployeeId: other.id,
    status: "waiting",
    dueDate: calendarDate("2026-11-10"),
  });
  const askedWaiting = await seed.task({
    assigneeEmployeeId: other.id,
    requestedByEmployeeId: employee.id,
    status: "waiting",
  });

  const tasks = await taskService(orm).listMyTasks(ctx);

  expect(tasks.waitingOnOthers.map(({ id }) => id)).toEqual([asked.id, held.id, askedWaiting.id]);
});

test("orders resolved tasks by their closing time newest first", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const people = { assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id };
  const newest = await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-11-09T11:00:00Z"),
    doneByEmployeeId: holder.id,
  });
  const oldest = await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-10-30T12:00:00Z"),
    doneByEmployeeId: holder.id,
  });
  const middle = await seed.task({
    ...people,
    status: "cancelled",
    cancelledAt: new Date("2026-11-05T12:00:00Z"),
    cancelReason: "No longer needed",
  });

  const tasks = await taskService(orm).listMyTasks(ctx);

  expect(tasks.resolvedRecently.map(({ id }) => id)).toEqual([newest.id, middle.id, oldest.id]);
});

test("keeps tasks closed within fourteen days and excludes tasks closed fifteen days ago", async ({
  orm,
  seed,
}) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const ctx = signedIn(orm, { employeeId: holder.id, profiles: ["EMPLOYEE"] });
  const people = { assigneeEmployeeId: holder.id, requestedByEmployeeId: asker.id };
  const done = await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-10-26T12:00:01Z"),
    doneByEmployeeId: holder.id,
  });
  const cancelled = await seed.task({
    ...people,
    status: "cancelled",
    cancelledAt: new Date("2026-10-26T12:00:02Z"),
    cancelReason: "No longer needed",
  });
  await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-10-25T12:00:00Z"),
    doneByEmployeeId: holder.id,
  });
  await seed.task({
    ...people,
    status: "cancelled",
    cancelledAt: new Date("2026-10-25T12:00:00Z"),
    cancelReason: "No longer needed",
  });

  const tasks = await taskService(orm).listMyTasks(ctx);

  expect(tasks.resolvedRecently.map(({ id }) => id)).toEqual([cancelled.id, done.id]);
});

test("returns empty groups for a caller without an employee", async ({ orm, seed }) => {
  const holder = await seed.employee();
  await seed.task({
    assigneeEmployeeId: holder.id,
    processSource: { processKey: "onboarding", processRunId: null, stepKey: "read_handbook" },
  });

  expect(await taskService(orm).listMyTasks(EMPLOYEE)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
});

test("hides tasks from the person they are about", async ({ orm, seed }) => {
  const holder = await seed.employee();
  const asker = await seed.employee();
  const about = await seed.employee();
  const ctx = signedIn(orm, { employeeId: about.id, profiles: ["OWNER"] });
  const people = {
    assigneeEmployeeId: holder.id,
    requestedByEmployeeId: asker.id,
    aboutEmployeeId: about.id,
  };
  await seed.task(people);
  await seed.task({ ...people, status: "waiting" });
  await seed.task({
    ...people,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: holder.id,
  });
  await seed.task({
    ...people,
    status: "cancelled",
    cancelledAt: new Date("2026-11-08T12:00:00Z"),
    cancelReason: "No longer needed",
  });

  expect(await taskService(orm).listMyTasks(ctx)).toEqual({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [],
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});
