import {
  employeeServices,
  expect,
  seedAnnualLeaveEmployee,
  OWNER,
  signedIn,
  test,
  bookTimeOffService,
  whosOutService,
  timeOffService,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";

test.for([1, 2, 3, 4, 5])(
  "cancels while the same person is deleted without a deadlock (run %i)",
  async (_run, { orm, seed, transact }) => {
    const person = await seedAnnualLeaveEmployee(orm, seed, transact);
    const service = bookTimeOffService(orm);
    const booked = await service.bookTimeOff(OWNER, {
      ...person,
      startDate: "2026-12-07",
      endDate: "2026-12-07",
    });

    const [cancelled, deleted] = await Promise.allSettled([
      service.cancelTimeOff(OWNER, { timeOffId: booked.id }),
      employeeServices(orm).deleteEmployee(OWNER, { id: person.employeeId }),
    ]);

    expect(deleted.status).toBe("fulfilled");
    if (cancelled.status === "rejected") {
      expect(cancelled.reason).toBeInstanceOf(ApplicationError);
      expect(cancelled.reason).toMatchObject({ code: "NOT_FOUND" });
    }
  },
);

test("refuses to cancel a booking with a day in a closed leave year", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const booked = await bookTimeOffService(orm, { today: "2026-11-09" }).bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });
  const service = bookTimeOffService(orm, { today: "2027-01-04" });

  await expect(service.cancelTimeOff(OWNER, { timeOffId: booked.id })).rejects.toMatchObject({
    code: "CONFLICT",
  });

  const calendar = await whosOutService(orm, { today: "2027-01-04" }).readWhosOut(OWNER, {
    employeeIds: [person.employeeId],
    from: "2026-12-01",
    until: "2026-12-31",
  });
  expect(calendar.get(person.employeeId)?.timeOff).toMatchObject([
    { id: booked.id, cost: 1, days: [{ date: "2026-12-07", dayPart: "full_day" }] },
  ]);
});

test("cancelling gives the booked days back", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const booked = await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "morning" }],
  });
  const before = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(before.get(person.employeeId)).toMatchObject([{ used: 2.5, remaining: 17.5 }]);

  await service.cancelTimeOff(OWNER, { timeOffId: booked.id });

  const after = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(after.get(person.employeeId)).toMatchObject([{ used: 0, remaining: 20 }]);
});

test("refuses to cancel a booking twice", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const booked = await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });
  await service.cancelTimeOff(OWNER, { timeOffId: booked.id });

  await expect(service.cancelTimeOff(OWNER, { timeOffId: booked.id })).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test("reports an unknown booking as not found", async ({ orm }) => {
  await expect(
    bookTimeOffService(orm).cancelTimeOff(OWNER, {
      timeOffId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("forbids an employee from cancelling their own booking", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const booked = await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });
  const self = signedIn(orm, { employeeId: person.employeeId, profiles: ["EMPLOYEE"] });

  await expect(service.cancelTimeOff(self, { timeOffId: booked.id })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
