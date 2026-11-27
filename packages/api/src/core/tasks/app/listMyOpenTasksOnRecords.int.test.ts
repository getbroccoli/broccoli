import { calendarDate, expect, OWNER, signedIn, taskService, test } from "#test/support";

test("returns the caller's open tasks on the records, by record id and soonest due first", async ({
  orm,
  seed,
}) => {
  const assignee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const later = await seed.task({
    assigneeEmployeeId: assignee.id,
    record: first,
    dueDate: calendarDate("2026-11-12"),
  });
  const other = await seed.task({ assigneeEmployeeId: assignee.id, record: second });
  const earlier = await seed.task({
    type: "process_step_to_do",
    assigneeEmployeeId: assignee.id,
    record: first,
    dueDate: calendarDate("2026-11-10"),
  });

  const tasks = await taskService(orm).listMyOpenTasksOnRecords(ctx, "time_off", [
    first.recordId,
    second.recordId,
  ]);

  expect(tasks).toEqual(
    new Map([
      [first.recordId, [earlier, later]],
      [second.recordId, [other]],
    ]),
  );
});

test("leaves out tasks assigned to someone else, including those the caller asked for", async ({
  orm,
  seed,
}) => {
  const caller = await seed.employee();
  const other = await seed.employee();
  const ctx = signedIn(orm, { employeeId: caller.id, profiles: ["EMPLOYEE"] });
  await seed.task({ assigneeEmployeeId: other.id, record: first });
  await seed.task({ assigneeEmployeeId: other.id, askedByEmployeeId: caller.id, record: first });

  const tasks = await taskService(orm).listMyOpenTasksOnRecords(ctx, "time_off", [first.recordId]);

  expect(tasks).toEqual(new Map());
});

test("leaves out done and cancelled tasks", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  const task = { assigneeEmployeeId: assignee.id, record: first };
  await seed.task({
    ...task,
    status: "done",
    doneAt: new Date("2026-11-08T12:00:00Z"),
    doneByEmployeeId: assignee.id,
  });
  await seed.task({
    ...task,
    status: "cancelled",
    cancelledAt: new Date("2026-11-07T12:00:00Z"),
    cancelReason: "No longer needed",
  });

  const tasks = await taskService(orm).listMyOpenTasksOnRecords(ctx, "time_off", [first.recordId]);

  expect(tasks).toEqual(new Map());
});

test("leaves out tasks on another record type and on records not asked for", async ({
  orm,
  seed,
}) => {
  const assignee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: assignee.id, profiles: ["EMPLOYEE"] });
  await seed.task({
    assigneeEmployeeId: assignee.id,
    record: { ...first, recordType: "employee" },
  });
  await seed.task({ assigneeEmployeeId: assignee.id, record: second });

  const tasks = await taskService(orm).listMyOpenTasksOnRecords(ctx, "time_off", [first.recordId]);

  expect(tasks).toEqual(new Map());
});

test("returns an empty map for a caller with no employee", async ({ orm, seed }) => {
  const assignee = await seed.employee();
  await seed.task({ assigneeEmployeeId: assignee.id, record: first });

  const tasks = await taskService(orm).listMyOpenTasksOnRecords(OWNER, "time_off", [
    first.recordId,
  ]);

  expect(tasks).toEqual(new Map());
});

const first = { recordType: "time_off", recordId: "00000000-0000-4000-8000-000000000001" };
const second = { recordType: "time_off", recordId: "00000000-0000-4000-8000-000000000002" };
