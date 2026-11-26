import {
  ADMIN,
  bookTimeOffService,
  expect,
  leaveRequestSetup,
  readAllowances,
  seedAnnualLeaveEmployee,
  signedIn,
  test,
} from "#test/support";

test("forbids an employee from booking their own leave when it needs approval", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const self = signedIn(orm, { employeeId: person.employeeId, profiles: ["EMPLOYEE"] });

  await expect(
    bookTimeOffService(orm).bookTimeOff(self, {
      ...person,
      startDate: "2026-12-07",
      endDate: "2026-12-07",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Your time off needs to be requested." });
});

test("books a new day immediately while the manager still decides the earlier request", async ({
  orm,
  seed,
}) => {
  const {
    requests,
    bookings,
    requester,
    manager,
    tasks,
    processes,
    input,
    changeAnnualLeaveApproval,
  } = await leaveRequestSetup(orm, seed);
  const request = await requests.requestTimeOff(requester, input);
  const { needsYou } = await tasks.listMyTasks(manager);
  expect(needsYou).toMatchObject([{ record: { recordId: request.id }, status: "to_do" }]);
  const runs = await processes.listRuns(ADMIN, "manager_approval");
  expect(runs).toMatchObject([{ record: { recordId: request.id }, status: "in_progress" }]);

  await changeAnnualLeaveApproval(null);
  const booking = await bookings.bookTimeOff(requester, {
    ...input,
    startDate: "2026-12-14",
    endDate: "2026-12-14",
    halfDays: [],
  });

  expect(booking.status).toBe("approved");
  const [allowance] = await readAllowances(orm, input.employeeId);
  expect(allowance!.total).toBe(19);
  expect(allowance!.lines.filter(({ kind }) => kind === "time_off_booked")).toMatchObject([
    { causeRef: booking.id, effectiveDate: "2026-12-14", amount: -1 },
  ]);
  expect((await tasks.listMyTasks(requester)).waitingOnOthers).toEqual(needsYou);
  expect(await processes.listRuns(ADMIN, "manager_approval")).toEqual(runs);
  expect(await processes.listRuns(ADMIN, "owner_approval")).toEqual([]);

  await tasks.markDone(manager, needsYou[0]!.id, { result: { code: "approved", comment: null } });
  expect((await requests.readStatuses(requester, [request.id])).get(request.id)?.status).toBe(
    "approved",
  );
  expect((await readAllowances(orm, input.employeeId))[0]!.total).toBe(16.5);
});

test("forbids an employee from booking for a colleague", async ({ orm, seed, transact }) => {
  const colleague = await seedAnnualLeaveEmployee(orm, seed, transact);
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  await expect(
    bookTimeOffService(orm).bookTimeOff(ctx, {
      ...colleague,
      startDate: "2026-12-07",
      endDate: "2026-12-07",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "You are not allowed to do this." });
});

test("lets an employee preview their own time off", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const self = signedIn(orm, { employeeId: person.employeeId, profiles: ["EMPLOYEE"] });

  const preview = await bookTimeOffService(orm).previewBooking(self, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });

  expect(preview).toMatchObject({ cost: 1, refusal: null });
});

test("forbids a manager from previewing time off they may read for a report", async ({
  orm,
  seed,
  transact,
}) => {
  const manager = await seed.employee();
  const report = await seedAnnualLeaveEmployee(orm, seed, transact);
  await seed.manager(report.employeeId, manager.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  await ctx.requireInScope("time_off", "read", report.employeeId);

  await expect(
    bookTimeOffService(orm).previewBooking(ctx, {
      ...report,
      startDate: "2026-12-07",
      endDate: "2026-12-07",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
