import { eq } from "drizzle-orm";
import {
  ADMIN,
  SYSTEM,
  calendarDate,
  employeeServices,
  expect,
  leaveRequestSetup,
  pendingRequest,
  readAllowances,
  seedEmploymentEnd,
  test,
  timeOffService,
} from "#test/support";

import { timeOff } from "../db";

test("approval charges the held days and records who decided", async ({ orm, seed }) => {
  const { tasks, manager, managerId, task, input, request } = await pendingRequest(orm, seed);

  await tasks.markDone(manager, task.id, { result: approved });

  expect(await orm.select().from(timeOff)).toMatchObject([
    {
      id: request.id,
      status: "approved",
      decidedAt: expect.any(Date) as unknown,
      decidedByEmployeeId: managerId,
    },
  ]);
  const [allowance] = await readAllowances(orm, input.employeeId);
  const lines = allowance!.lines
    .filter(({ kind }) => kind === "time_off_booked")
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const cause = { causeKind: "time_off_approved", causeRef: request.id };
  expect(lines).toMatchObject([
    { effectiveDate: "2026-12-07", amount: -1, ...cause },
    { effectiveDate: "2026-12-08", amount: -1, ...cause },
    { effectiveDate: "2026-12-09", amount: -0.5, ...cause },
  ]);
  const figures = await timeOffService(orm).readTimeOffTypes(manager, {
    employeeIds: [input.employeeId],
  });
  expect(figures.get(input.employeeId)).toMatchObject([{ waiting: 0, used: 2.5, remaining: 17.5 }]);
});

test("rejection records the reason and leaves the allowance alone", async ({ orm, seed }) => {
  const { tasks, manager, managerId, task, input, request } = await pendingRequest(orm, seed);
  const before = await readAllowances(orm, input.employeeId);

  await tasks.markDone(manager, task.id, { result: rejected });

  expect(await orm.select().from(timeOff)).toMatchObject([
    {
      id: request.id,
      status: "rejected",
      decisionComment: rejected.comment,
      decidedByEmployeeId: managerId,
      decidedAt: expect.any(Date) as unknown,
    },
  ]);
  expect(await readAllowances(orm, input.employeeId)).toEqual(before);
});

test("ends a request without a decision when nobody can approve", async ({ orm, seed }) => {
  const { requests, requester, input } = await leaveRequestSetup(orm, seed);
  await seed.owner();
  await seed.manager(input.employeeId, null);

  const request = await requests.requestTimeOff(requester, input);

  expect(request.status).toBe("cancelled");
  expect(await orm.select().from(timeOff)).toMatchObject([
    {
      id: request.id,
      status: "cancelled",
      cancelledAt: null,
      decidedAt: null,
      decidedByEmployeeId: null,
      decisionComment: null,
    },
  ]);
});

test("keeps the task open when employment ends before the last requested day", async ({
  orm,
  seed,
}) => {
  const { tasks, manager, task, input, request } = await pendingRequest(orm, seed);
  await seedEmploymentEnd(orm, input.employeeId, "2026-12-08");

  await expect(tasks.markDone(manager, task.id, { result: approved })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    message: "Amira isn't employed on Wed 9 Dec, so this can't be approved. Reject it instead.",
    fieldErrors: [{ field: "dates", code: "outside_employment" }],
  });

  expect(await tasks.readTask(manager, task.id)).toMatchObject({ status: "to_do", result: null });
  expect(await orm.select().from(timeOff)).toMatchObject([
    {
      id: request.id,
      status: "requested",
      decidedAt: null,
      decidedByEmployeeId: null,
    },
  ]);
});

test("refuses to cancel a rejected request", async ({ orm, seed }) => {
  const { bookings, tasks, manager, task, request } = await pendingRequest(orm, seed);
  await tasks.markDone(manager, task.id, { result: rejected });

  await expect(bookings.cancelTimeOff(ADMIN, { timeOffId: request.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This time off was rejected.",
  });
});

test("an admin can cancel an approved request and return its days", async ({ orm, seed }) => {
  const { bookings, tasks, manager, managerId, task, request, input } = await pendingRequest(
    orm,
    seed,
  );
  await tasks.markDone(manager, task.id, { result: approved });

  await bookings.cancelTimeOff(ADMIN, { timeOffId: request.id });

  expect(await orm.select().from(timeOff)).toMatchObject([
    {
      id: request.id,
      status: "cancelled",
      decidedAt: expect.any(Date) as unknown,
      decidedByEmployeeId: managerId,
    },
  ]);
  const figures = await timeOffService(orm).readTimeOffTypes(ADMIN, {
    employeeIds: [input.employeeId],
  });
  expect(figures.get(input.employeeId)).toMatchObject([{ waiting: 0, used: 0, remaining: 20 }]);
});

test("can request another day while the manager approves the previous request", async ({
  orm,
  seed,
}) => {
  const { requests, requester, manager, input, tasks, request } = await pendingRequest(orm, seed);
  let previous = request.id;

  for (const date of ["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"]) {
    const [task] = (await tasks.listMyTasks(manager)).needsYou;
    const [next] = await Promise.all([
      requests.requestTimeOff(requester, {
        ...input,
        startDate: date,
        endDate: date,
        halfDays: [],
      }),
      tasks.markDone(manager, task!.id, { result: approved }),
    ]);

    expect(await orm.select().from(timeOff).where(eq(timeOff.id, previous))).toMatchObject([
      { status: "approved" },
    ]);
    expect(await orm.select().from(timeOff).where(eq(timeOff.id, next.id))).toMatchObject([
      { status: "requested" },
    ]);
    previous = next.id;
  }
});

test("cancels the approval run after its requester and time off were deleted", async ({
  orm,
  seed,
}) => {
  const { processes, input, request } = await pendingRequest(orm, seed);
  await employeeServices(orm).deleteEmployee(ADMIN, { id: input.employeeId });

  await processes.startDueRuns(SYSTEM, calendarDate("2026-11-26"));

  expect(await processes.listRuns(ADMIN, "manager_approval")).toMatchObject([
    { record: { recordType: "time_off", recordId: request.id }, status: "cancelled" },
  ]);
  expect(await orm.select().from(timeOff)).toEqual([]);
});

const approved = { code: "approved", comment: null };
const rejected = { code: "rejected", comment: "Clashes with the release week." };
