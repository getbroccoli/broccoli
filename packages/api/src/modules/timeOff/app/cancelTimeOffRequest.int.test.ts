import {
  ADMIN,
  OWNER,
  bookTimeOffService,
  employeeServices,
  expect,
  leaveRequestSetup,
  pendingRequest,
  signedIn,
  test,
  timeOffService,
  type TestSeed,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { timeOff } from "../db";

test("withdrawing a waiting request ends its approval and frees its held days", async ({
  orm,
  seed,
}) => {
  const { bookings, requester, request, processes, tasks, manager, task, input } =
    await pendingRequest(orm, seed);

  await bookings.cancelTimeOff(requester, { timeOffId: request.id });

  expect(await orm.select().from(timeOff)).toMatchObject([
    {
      id: request.id,
      status: "cancelled",
      cancelledAt: expect.any(Date) as unknown,
      cancelledByEmployeeId: input.employeeId,
      decidedAt: null,
    },
  ]);
  expect(await processes.listRuns(ADMIN, "manager_approval")).toMatchObject([
    {
      record: { recordType: "time_off", recordId: request.id },
      status: "cancelled",
    },
  ]);
  expect(await tasks.readTask(manager, task.id)).toMatchObject({
    status: "cancelled",
    cancelReason: "Amira withdrew this request.",
  });
  const figures = await timeOffService(orm).readTimeOffTypes(manager, {
    employeeIds: [input.employeeId],
  });
  expect(figures.get(input.employeeId)).toMatchObject([{ waiting: 0, remaining: 20 }]);
});

test("an admin cancelling a waiting request is named on the approver's task", async ({
  orm,
  seed,
}) => {
  const { bookings, request, tasks, manager, task } = await pendingRequest(orm, seed);
  const hannah = await admin(orm, seed);

  await bookings.cancelTimeOff(hannah, { timeOffId: request.id });

  expect(await tasks.readTask(manager, task.id)).toMatchObject({
    status: "cancelled",
    cancelReason: "Hannah Weber cancelled this request.",
  });
});

test("the requester cancels approved leave before it starts and gets the days back", async ({
  orm,
  seed,
}) => {
  const { bookings, requester, request, tasks, manager, task, input } = await pendingRequest(
    orm,
    seed,
  );
  await tasks.markDone(manager, task.id, { result: approved });

  await bookings.cancelTimeOff(requester, { timeOffId: request.id });

  expect(await orm.select().from(timeOff)).toMatchObject([
    {
      id: request.id,
      status: "cancelled",
      cancelledByEmployeeId: input.employeeId,
    },
  ]);
  const figures = await timeOffService(orm).readTimeOffTypes(manager, {
    employeeIds: [input.employeeId],
  });
  expect(figures.get(input.employeeId)).toMatchObject([{ used: 0, remaining: 20 }]);
});

test("refuses the requester cancelling approved leave on its first day", async ({ orm, seed }) => {
  const { bookings, requester, request, tasks, manager, task } = await pendingRequest(orm, seed, {
    startDate: "2026-11-26",
    endDate: "2026-11-27",
  });
  await tasks.markDone(manager, task.id, { result: approved });

  await expect(bookings.cancelTimeOff(requester, { timeOffId: request.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This time off has started. Ask an admin to cancel it.",
  });
});

test("refuses the person cancelling time off someone else booked for them", async ({
  orm,
  seed,
}) => {
  const { bookings, requester, booking } = await adminBooking(orm, seed);

  await expect(bookings.cancelTimeOff(requester, { timeOffId: booking.id })).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only an admin can cancel time off someone else booked for you.",
  });
});

test("refuses a manager cancelling their report's waiting request", async ({ orm, seed }) => {
  const { bookings, manager, request } = await pendingRequest(orm, seed);

  await expect(bookings.cancelTimeOff(manager, { timeOffId: request.id })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses a canceller deleted since signing in and leaves the request waiting", async ({
  orm,
  seed,
}) => {
  const { bookings, request, tasks, manager, task } = await pendingRequest(orm, seed);
  const hannah = await seed.employee({ firstName: "Hannah", lastName: "Weber" });
  const caller = signedIn(orm, { employeeId: hannah.id, profiles: ["ADMIN"] });
  await employeeServices(orm).deleteEmployee(ADMIN, { id: hannah.id });

  const cancel = bookings.cancelTimeOff(caller, { timeOffId: request.id });

  await expect(cancel).rejects.toBeInstanceOf(ApplicationError);
  await expect(cancel).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await orm.select().from(timeOff)).toMatchObject([{ id: request.id, status: "requested" }]);
  expect(await tasks.readTask(manager, task.id)).toMatchObject({ status: "to_do" });
});

test("refuses the requester cancelling a rejected request", async ({ orm, seed }) => {
  const { bookings, requester, request, tasks, manager, task } = await pendingRequest(orm, seed);
  await tasks.markDone(manager, task.id, {
    result: { code: "rejected", comment: "Cover is unavailable." },
  });

  await expect(bookings.cancelTimeOff(requester, { timeOffId: request.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This time off was rejected.",
  });
});

test("the approver can no longer decide a withdrawn request", async ({ orm, seed }) => {
  const { bookings, requester, request, tasks, manager, task } = await pendingRequest(orm, seed);
  await bookings.cancelTimeOff(requester, { timeOffId: request.id });

  await expect(tasks.markDone(manager, task.id, { result: approved })).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test.for([1, 2, 3, 4, 5])(
  "the requester withdraws two waiting requests at the same time (run %i)",
  async (_run, { orm, seed }) => {
    const { bookings, requests, requester, input } = await leaveRequestSetup(orm, seed);
    const [first, second] = await Promise.all([
      requests.requestTimeOff(requester, input),
      requests.requestTimeOff(requester, {
        ...input,
        startDate: "2026-12-14",
        endDate: "2026-12-14",
        halfDays: [],
      }),
    ]);

    const results = await Promise.allSettled([
      bookings.cancelTimeOff(requester, { timeOffId: first.id }),
      bookings.cancelTimeOff(requester, { timeOffId: second.id }),
    ]);

    expect(results).toMatchObject([{ status: "fulfilled" }, { status: "fulfilled" }]);
    expect(await orm.select({ status: timeOff.status }).from(timeOff)).toEqual([
      { status: "cancelled" },
      { status: "cancelled" },
    ]);
  },
);

test.for([1, 2, 3, 4, 5])(
  "either withdrawal or approval wins when they race (run %i)",
  async (_run, { orm, seed }) => {
    const { bookings, requester, request, tasks, manager, task, processes } = await pendingRequest(
      orm,
      seed,
    );

    const [withdraw, approve] = await Promise.allSettled([
      bookings.cancelTimeOff(requester, { timeOffId: request.id }),
      tasks.markDone(manager, task.id, { result: approved }),
    ]);

    const withdrawn = withdraw.status === "fulfilled";
    const loser = withdrawn ? approve : withdraw;
    expect(loser).toMatchObject({
      status: "rejected",
      reason: expect.any(ApplicationError) as unknown,
    });
    expect(loser).toMatchObject({ reason: { code: "CONFLICT" } });
    expect(approve.status).toBe(withdrawn ? "rejected" : "fulfilled");
    expect(await orm.select().from(timeOff)).toMatchObject([
      { id: request.id, status: withdrawn ? "cancelled" : "approved" },
    ]);
    expect(await processes.listRuns(ADMIN, "manager_approval")).toMatchObject([
      { status: withdrawn ? "cancelled" : "finished" },
    ]);
  },
);

test.for([1, 2, 3, 4, 5])(
  "withdrawing while the requester is deleted ends without a deadlock (run %i)",
  async (_run, { orm, seed }) => {
    const { bookings, requester, request, input } = await pendingRequest(orm, seed);

    const [withdrawn, deleted] = await Promise.allSettled([
      bookings.cancelTimeOff(requester, { timeOffId: request.id }),
      employeeServices(orm).deleteEmployee(ADMIN, { id: input.employeeId }),
    ]);

    expect(deleted.status).toBe("fulfilled");
    if (withdrawn.status === "rejected") {
      expect(withdrawn.reason).toBeInstanceOf(ApplicationError);
      expect(withdrawn.reason).toMatchObject({ code: "NOT_FOUND" });
    }
  },
);

test.for([1, 2, 3, 4, 5])(
  "two admins can cancel each other's approved leave at the same time (run %i)",
  async (_run, { orm, seed }) => {
    const { bookings, input } = await leaveRequestSetup(orm, seed);
    const hannah = await seed.employee({ firstName: "Hannah", startDate: "2025-01-01" });
    const amiraAdmin = signedIn(orm, { employeeId: input.employeeId, profiles: ["ADMIN"] });
    const hannahAdmin = signedIn(orm, { employeeId: hannah.id, profiles: ["ADMIN"] });
    const amiraLeave = await bookings.bookTimeOff(ADMIN, input);
    const hannahLeave = await bookings.bookTimeOff(ADMIN, { ...input, employeeId: hannah.id });

    const results = await Promise.allSettled([
      bookings.cancelTimeOff(amiraAdmin, { timeOffId: hannahLeave.id }),
      bookings.cancelTimeOff(hannahAdmin, { timeOffId: amiraLeave.id }),
    ]);

    expect(results).toMatchObject([{ status: "fulfilled" }, { status: "fulfilled" }]);
  },
);

test("only the requester and admin may cancel a waiting request", async ({ orm, seed }) => {
  const { requests, request, requester, manager } = await pendingRequest(orm, seed);
  const hannah = await admin(orm, seed);
  const ben = await seed.employee({ firstName: "Ben" });
  const colleague = signedIn(orm, { employeeId: ben.id, profiles: ["EMPLOYEE"] });
  const ids = [request.id];

  expect(await requests.readCancellable(requester, ids)).toEqual(new Set(ids));
  expect(await requests.readCancellable(hannah, ids)).toEqual(new Set(ids));
  expect(await requests.readCancellable(manager, ids)).toEqual(new Set());
  expect(await requests.readCancellable(colleague, ids)).toEqual(new Set());
});

test("an admin may cancel admin-booked time off and the person may not", async ({ orm, seed }) => {
  const { requests, requester, booking } = await adminBooking(orm, seed);
  const hannah = await admin(orm, seed);
  const ids = [booking.id];

  expect(await requests.readCancellable(hannah, ids)).toEqual(new Set(ids));
  expect(await requests.readCancellable(requester, ids)).toEqual(new Set());
});

test("approved time off in a closed leave year is no longer cancellable for an admin", async ({
  orm,
  seed,
}) => {
  const { requests, input } = await leaveRequestSetup(orm, seed, { today: "2027-01-04" });
  const booking = await bookTimeOffService(orm, { today: "2026-11-26" }).bookTimeOff(ADMIN, input);

  expect(await requests.readCancellable(ADMIN, [booking.id])).toEqual(new Set());
});

test("an owner without an employee records a cancellation with no named canceller", async ({
  orm,
  seed,
}) => {
  const { bookings, request, requester, requests } = await pendingRequest(orm, seed);

  await bookings.cancelTimeOff(OWNER, { timeOffId: request.id });

  const [row] = await orm.select().from(timeOff);
  expect(row).toMatchObject({
    id: request.id,
    status: "cancelled",
    cancelledAt: expect.any(Date) as unknown,
    cancelledByEmployeeId: null,
  });
  const statuses = await requests.readStatuses(requester, [request.id]);
  expect(statuses.get(request.id)?.cancellation).toEqual({
    cancelledAt: row!.cancelledAt,
    cancelledByEmployeeId: null,
  });
});

test("a withdrawn request shows who cancelled it", async ({ orm, seed }) => {
  const { requests, bookings, requester, request, input } = await pendingRequest(orm, seed);
  await bookings.cancelTimeOff(requester, { timeOffId: request.id });

  const statuses = await requests.readStatuses(requester, [request.id]);

  expect(statuses.get(request.id)).toMatchObject({
    status: "cancelled",
    cancellation: {
      cancelledAt: expect.any(Date) as unknown,
      cancelledByEmployeeId: input.employeeId,
    },
  });
});

const approved = { code: "approved", comment: null };

async function adminBooking(orm: Orm, seed: TestSeed) {
  const setup = await leaveRequestSetup(orm, seed);
  const booking = await setup.bookings.bookTimeOff(ADMIN, {
    ...setup.input,
    startDate: "2026-12-14",
    endDate: "2026-12-14",
    halfDays: [],
  });
  return { ...setup, booking };
}

async function admin(orm: Orm, seed: TestSeed) {
  const hannah = await seed.employee({ firstName: "Hannah", lastName: "Weber" });
  return signedIn(orm, { employeeId: hannah.id, profiles: ["ADMIN"] });
}
