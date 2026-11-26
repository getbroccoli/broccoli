import {
  ADMIN,
  expect,
  giveTermsPolicies,
  leaveRequestSetup,
  readAllowances,
  readTermsPolicies,
  signedIn,
  test,
  timeOffService,
} from "#test/support";

import { timeOff } from "../db";

test("holds two days and a morning without spending the allowance", async ({ orm, seed }) => {
  const { requests, requester, input } = await leaveRequestSetup(orm, seed);
  const before = await readAllowances(orm, input.employeeId);

  const request = await requests.requestTimeOff(requester, input);

  expect(request).toMatchObject({
    cost: 2.5,
    days: [
      { date: "2026-12-07", dayPart: "full_day" },
      { date: "2026-12-08", dayPart: "full_day" },
      { date: "2026-12-09", dayPart: "morning" },
    ],
  });
  expect(await orm.select().from(timeOff)).toMatchObject([
    { id: request.id, status: "requested", requestedAt: expect.any(Date) as unknown },
  ]);
  expect(await readAllowances(orm, input.employeeId)).toEqual(before);
  const figures = await timeOffService(orm).readTimeOffTypes(requester, {
    employeeIds: [input.employeeId],
  });
  expect(figures.get(input.employeeId)).toMatchObject([{ waiting: 2.5, used: 0, remaining: 20 }]);
});

test("sends the request details to the requester's manager", async ({ orm, seed }) => {
  const { requests, requester, manager, input, tasks, processes } = await leaveRequestSetup(
    orm,
    seed,
  );

  const request = await requests.requestTimeOff(requester, input);

  expect(await processes.listRuns(ADMIN, "manager_approval")).toMatchObject([
    {
      record: { recordType: "time_off", recordId: request.id },
      subjectEmployeeId: input.employeeId,
    },
  ]);
  const { needsYou } = await tasks.listMyTasks(manager);
  expect(needsYou).toMatchObject([
    {
      title: "Approve Amira's Annual leave, 7–9 Dec",
      askedByEmployeeId: input.employeeId,
    },
  ]);
  const description = needsYou[0]!.description;
  for (const detail of ["Annual leave", "2.5", "morning", input.note]) {
    expect(description?.toLowerCase()).toContain(detail.toLowerCase());
  }
  expect(description).toMatch(/\b20\b/);
  expect(description).toMatch(/\b17\.5\b/);
});

test.for(["request", "book"] as const)(
  "refuses a %s for a day already held by a request",
  async (operation, { orm, seed }) => {
    const { requests, bookings, requester, input } = await leaveRequestSetup(orm, seed);
    await requests.requestTimeOff(requester, input);
    const tuesday = { ...input, startDate: "2026-12-08", endDate: "2026-12-08", halfDays: [] };

    const overlap =
      operation === "request"
        ? requests.requestTimeOff(requester, tuesday)
        : bookings.bookTimeOff(ADMIN, tuesday);

    await expect(overlap).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "dates", code: "clashes_with_time_off" }],
    });
  },
);

test("allows an afternoon request beside a waiting morning", async ({ orm, seed }) => {
  const { requests, requester, input } = await leaveRequestSetup(orm, seed);
  await requests.requestTimeOff(requester, input);

  const afternoon = await requests.requestTimeOff(requester, {
    ...input,
    startDate: input.endDate,
    halfDays: [{ date: input.endDate, dayPart: "afternoon" }],
  });

  expect(afternoon).toMatchObject({
    cost: 0.5,
    days: [{ date: input.endDate, dayPart: "afternoon" }],
  });
});

test("subtracts waiting days from the next request preview", async ({ orm, seed }) => {
  const { requests, bookings, requester, input } = await leaveRequestSetup(orm, seed);
  await requests.requestTimeOff(requester, input);

  const preview = await bookings.previewBooking(requester, {
    ...input,
    startDate: "2026-12-14",
    endDate: "2026-12-15",
    halfDays: [],
  });

  expect(preview).toMatchObject({
    refusal: null,
    balances: [{ remainingBefore: 17.5, remainingAfter: 15.5 }],
  });
});

test("refuses a sickness request even when sickness is offered", async ({
  orm,
  seed,
  transact,
}) => {
  const { requests, requester, input } = await leaveRequestSetup(orm, seed);
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "sickness" }] });
  const sickness = (await readTermsPolicies(orm, termsId)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!;

  await expect(
    requests.requestTimeOff(requester, { ...input, timeOffTypeId: sickness.timeOffTypeId }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "timeOffTypeId", code: "needs_no_approval" }],
  });
});

test("refuses an employee asking for someone else's time off", async ({ orm, seed }) => {
  const { requests, requester, input } = await leaveRequestSetup(orm, seed);
  const ben = await seed.employee({ firstName: "Ben" });

  await expect(
    requests.requestTimeOff(requester, { ...input, employeeId: ben.id }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You can only request your own time off.",
  });
});

test("directs an admin asking for their own time off to book it", async ({ orm, seed }) => {
  const { requests, input } = await leaveRequestSetup(orm, seed);
  const hannah = await seed.employee({ firstName: "Hannah" });
  const admin = signedIn(orm, { employeeId: hannah.id, profiles: ["ADMIN"] });

  await expect(
    requests.requestTimeOff(admin, { ...input, employeeId: hannah.id }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You can book this time off straight away.",
  });
});

test("refuses cancellation while the request is waiting for approval", async ({ orm, seed }) => {
  const { requests, bookings, requester, input } = await leaveRequestSetup(orm, seed);
  const request = await requests.requestTimeOff(requester, input);

  await expect(bookings.cancelTimeOff(ADMIN, { timeOffId: request.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This time off is waiting for approval.",
  });
});
