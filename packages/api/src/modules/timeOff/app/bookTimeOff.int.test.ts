import {
  expect,
  seedAnnualLeaveEmployee,
  giveDefaultTermsStatutoryMinimum,
  giveTermsPolicies,
  OWNER,
  seedEmploymentEnd,
  seedTimeOffType,
  signedIn,
  test,
  bookTimeOffService,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";

import { timeOffTypes } from "../db";

test("books while a policy change runs for the same people without a deadlock", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const termsId = await seed.defaultTermsId();
  const bookings = bookTimeOffService(orm);
  const policies = timeOffPolicyService(orm, { today: "2026-11-09" });

  const rules = {
    balance: "balance_from_allowance",
    entitlementDays: 27,
    bankHolidays: "bank_holidays_included_in_allowance",
  } as const;

  for (const date of ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11"]) {
    const draft = await policies.saveTimeOffPolicy(OWNER, { termsId, ...person, rules });
    await expect(
      Promise.all([
        bookings.bookTimeOff(OWNER, { ...person, startDate: date, endDate: date }),
        policies.publishTerms(OWNER, {
          termsId,
          versions: [draft],
          startDate: "2026-11-09",
          owners: [{ termsId }],
        }),
      ]),
    ).resolves.toMatchObject([{ cost: 1 }, { id: termsId }]);
  }
});

test("books two full days and a morning and deducts 2.5 days", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  const booked = await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "morning" }],
  });

  expect(booked).toMatchObject({
    cost: 2.5,
    days: [
      { date: "2026-12-07", dayPart: "full_day" },
      { date: "2026-12-08", dayPart: "full_day" },
      { date: "2026-12-09", dayPart: "morning" },
    ],
  });
  const rows = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(rows.get(person.employeeId)).toMatchObject([{ used: 2.5, remaining: 17.5 }]);
});

test("books working days over Christmas", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  const booked = await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-24",
    endDate: "2027-01-04",
  });

  expect(booked).toMatchObject({
    cost: 5,
    days: [
      { date: "2026-12-24", dayPart: "full_day" },
      { date: "2026-12-29", dayPart: "full_day" },
      { date: "2026-12-30", dayPart: "full_day" },
      { date: "2026-12-31", dayPart: "full_day" },
      { date: "2027-01-04", dayPart: "full_day" },
    ],
  });
  const rows = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(rows.get(person.employeeId)).toMatchObject([{ used: 4, remaining: 16 }]);
});

test("creates and charges the next leave year's allowance", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...person,
    startDate: "2027-01-04",
    endDate: "2027-01-04",
  });

  const rows = await timeOffService(orm, { today: "2027-01-04" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(rows.get(person.employeeId)).toMatchObject([
    { periodStart: "2027-01-01", entitlement: 28, bankHolidays: 8, used: 1, remaining: 19 },
  ]);
});

test("allows a booking to take the balance below zero", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-11-02",
    endDate: "2026-11-25",
  });
  const before = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(before.get(person.employeeId)).toMatchObject([{ remaining: 2 }]);

  await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "morning" }],
  });

  const after = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(after.get(person.employeeId)).toMatchObject([{ used: 20.5, remaining: -0.5 }]);
});

test.for(["full_day", "morning"] as const)(
  "refuses a %s over a booked full day",
  async (dayPart, { orm, seed, transact }) => {
    const person = await seedAnnualLeaveEmployee(orm, seed, transact);
    const service = bookTimeOffService(orm);
    const input = { ...person, startDate: "2026-12-07", endDate: "2026-12-07" };
    await service.bookTimeOff(OWNER, input);

    await expect(
      service.bookTimeOff(OWNER, {
        ...input,
        halfDays: dayPart === "morning" ? [{ date: input.startDate, dayPart }] : [],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "dates", code: "clashes_with_time_off" }],
    });
  },
);

test("books a morning beside an afternoon on the same date", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const input = { ...person, startDate: "2026-12-07", endDate: "2026-12-07" };
  await service.bookTimeOff(OWNER, {
    ...input,
    halfDays: [{ date: input.startDate, dayPart: "afternoon" }],
  });

  const booked = await service.bookTimeOff(OWNER, {
    ...input,
    halfDays: [{ date: input.startDate, dayPart: "morning" }],
  });

  expect(booked).toMatchObject({ cost: 0.5, days: [{ date: "2026-12-07", dayPart: "morning" }] });
});

test("books over a cancelled booking", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const input = { ...person, startDate: "2026-12-07", endDate: "2026-12-07" };
  const first = await service.bookTimeOff(OWNER, input);
  await service.cancelTimeOff(OWNER, { timeOffId: first.id });

  const booked = await service.bookTimeOff(OWNER, input);

  expect(booked.id).not.toBe(first.id);
  expect(booked.cost).toBe(1);
});

test.for([
  { reason: "no_working_days", startDate: "2026-12-05", endDate: "2026-12-06" },
  { reason: "outside_booking_window", startDate: "2025-12-01", endDate: "2025-12-01" },
  { reason: "outside_booking_window", startDate: "2028-01-04", endDate: "2028-01-04" },
  { reason: "longer_than_a_year", startDate: "2026-01-01", endDate: "2027-01-02" },
])(
  "refuses $reason for $startDate to $endDate",
  async ({ reason, startDate, endDate }, { orm, seed, transact }) => {
    const person = await seedAnnualLeaveEmployee(orm, seed, transact);

    await expect(
      bookTimeOffService(orm).bookTimeOff(OWNER, {
        ...person,
        startDate,
        endDate,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "dates", code: reason }],
    });
  },
);

test("refuses a company type with no policy for the person", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
  const type = await seedTimeOffType(orm, "Volunteering");

  await expect(
    bookTimeOffService(orm).bookTimeOff(OWNER, {
      employeeId: employee.id,
      timeOffTypeId: type.id,
      startDate: "2026-12-07",
      endDate: "2026-12-07",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "dates", code: "type_not_offered" }],
  });
});

test.for([
  { startDate: "2027-02-01", endDate: null, date: "2027-01-04" },
  { startDate: "2025-01-01", endDate: "2026-11-30", date: "2026-12-07" },
])(
  "refuses $date outside employment from $startDate to $endDate",
  async ({ startDate, endDate, date }, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate });
    if (endDate) await seedEmploymentEnd(orm, employee.id, endDate);
    await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
    const annual = (await orm.select().from(timeOffTypes)).find(
      ({ typeKey }) => typeKey === "annual_leave",
    )!;

    await expect(
      bookTimeOffService(orm).bookTimeOff(OWNER, {
        employeeId: employee.id,
        timeOffTypeId: annual.id,
        startDate: date,
        endDate: date,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "dates", code: "outside_employment" }],
    });
  },
);

test("refuses a half day on a bank holiday", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  await expect(
    bookTimeOffService(orm).bookTimeOff(OWNER, {
      ...person,
      startDate: "2026-12-24",
      endDate: "2026-12-25",
      halfDays: [{ date: "2026-12-25", dayPart: "morning" }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "halfDays", code: "not_a_working_day" }],
  });
});

test("records sickness without a balance", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ recordOnly: "sickness" }],
  });
  const sickness = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!;

  const booked = await bookTimeOffService(orm).bookTimeOff(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: sickness.id,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });

  expect(booked.cost).toBe(1);
  const rows = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [employee.id],
  });
  expect(rows.get(employee.id)).toMatchObject([
    { balance: "no_balance", used: 1, remaining: null },
  ]);
});

test("forbids an employee from booking for themselves", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const self = signedIn(orm, { employeeId: person.employeeId, profiles: ["EMPLOYEE"] });

  await expect(
    bookTimeOffService(orm).bookTimeOff(self, {
      ...person,
      startDate: "2026-12-07",
      endDate: "2026-12-07",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("refuses one of two bookings for the same day", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const input = { ...person, startDate: "2026-12-07", endDate: "2026-12-07" };

  const results = await Promise.allSettled([
    service.bookTimeOff(OWNER, input),
    service.bookTimeOff(OWNER, input),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    {
      reason: {
        code: "INVALID_INPUT",
        fieldErrors: [{ field: "dates", code: "clashes_with_time_off" }],
      },
    },
  ]);
  const rows = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(rows.get(person.employeeId)).toMatchObject([{ used: 1, remaining: 19 }]);
});
