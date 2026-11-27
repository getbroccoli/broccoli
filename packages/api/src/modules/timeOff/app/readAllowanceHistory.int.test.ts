import {
  allowanceService,
  bookTimeOffService,
  expect,
  giveDefaultTermsStatutoryMinimum,
  OWNER,
  seedAnnualLeaveAllowance,
  signedIn,
  test,
  timeOffService,
} from "#test/support";

test("lists the statutory grant and eight bank holidays as one change", async ({
  orm,
  seed,
  transact,
}) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);

  const history = await allowanceService(orm).readAllowanceHistory(OWNER, {
    allowanceIds: [allowanceId],
  });

  expect(history.get(allowanceId)).toMatchObject([
    {
      cause: "time_off_turned_on",
      amount: 20,
      balanceAfter: 20,
      entitlementAfter: 28,
      bankHolidaysAfter: 8,
      usedAfter: 0,
      bookedDays: null,
      comment: null,
    },
  ]);
});

test("lists the cancellation before its booking and restores the same two and a half days", async ({
  orm,
  seed,
  transact,
}) => {
  const { allowanceId, employeeId, timeOffTypeId } = await seedAnnualLeaveAllowance(
    orm,
    seed,
    transact,
  );
  const bookings = bookTimeOffService(orm);
  const booked = await bookings.bookTimeOff(OWNER, {
    employeeId,
    timeOffTypeId,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "morning" }],
  });
  await bookings.cancelTimeOff(OWNER, { timeOffId: booked.id });

  const history = await allowanceService(orm).readAllowanceHistory(OWNER, {
    allowanceIds: [allowanceId],
  });

  const bookedDays = { first: "2026-12-07", last: "2026-12-09" };
  expect(history.get(allowanceId)).toMatchObject([
    { cause: "time_off_cancelled", amount: 2.5, balanceAfter: 20, bookedDays },
    { cause: "time_off_booked", amount: -2.5, balanceAfter: 17.5, bookedDays },
    { cause: "time_off_turned_on", balanceAfter: 20 },
  ]);
});

test("shows the October joiner's rounded remaining figure as the newest balance", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2026-10-12" });
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
  const cards = await timeOffService(orm).readTimeOffTypes(OWNER, { employeeIds: [employee.id] });
  const card = cards.get(employee.id)![0]!;

  const history = await allowanceService(orm).readAllowanceHistory(OWNER, {
    allowanceIds: [card.allowanceId!],
  });

  expect(card.remaining).toBe(4.5);
  expect(history.get(card.allowanceId!)![0]!.balanceAfter).toBe(card.remaining);
});

test.for(["self", "manager two levels up", "admin", "colleague"] as const)(
  "applies the time off history read scope for a %s",
  async (reader, { orm, seed, transact }) => {
    const { employeeId, allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
    const manager = await seed.employee();
    const director = await seed.employee();
    const colleague = await seed.employee();
    await seed.manager(employeeId, manager.id);
    await seed.manager(manager.id, director.id);
    const contexts = {
      self: signedIn(orm, { employeeId, profiles: ["EMPLOYEE"] }),
      "manager two levels up": signedIn(orm, { employeeId: director.id, profiles: ["EMPLOYEE"] }),
      admin: signedIn(orm, { employeeId: colleague.id, profiles: ["ADMIN"] }),
      colleague: signedIn(orm, { employeeId: colleague.id, profiles: ["EMPLOYEE"] }),
    };
    const service = allowanceService(orm);
    await service.adjustAllowance(OWNER, { allowanceId, amount: 2, comment: "Carry-over" });

    const history = await service.readAllowanceHistory(contexts[reader], {
      allowanceIds: [allowanceId],
    });

    if (reader === "colleague") {
      expect(history.has(allowanceId)).toBe(false);
    } else {
      expect(history.get(allowanceId)).toMatchObject([
        { cause: "allowance_adjusted", comment: "Carry-over" },
        { cause: "time_off_turned_on" },
      ]);
    }
  },
);
