import { bookTimeOffService, expect, seedAnnualLeaveEmployee, signedIn, test } from "#test/support";

test("forbids an employee from booking for themselves", async ({ orm, seed, transact }) => {
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
