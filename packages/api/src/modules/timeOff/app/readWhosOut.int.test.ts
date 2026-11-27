import {
  expect,
  seedAnnualLeaveEmployee,
  seedOwnWeek,
  seedWorkingPattern,
  giveDefaultTermsStatutoryMinimum,
  giveTermsPolicies,
  leaveRequestSetup,
  OWNER,
  SYSTEM,
  signedIn,
  test,
  bookTimeOffService,
  whosOutService,
  timeOffService,
} from "#test/support";

import type { Orm } from "../../../core/db";
import { timeOffTypes } from "../db";

test("lists every date of a month with employment, working days and bank holidays", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2026-12-14" });

  const rows = await whosOutService(orm).readWhosOut(OWNER, {
    employeeIds: [employee.id],
    from: "2026-12-01",
    until: "2026-12-31",
  });

  const days = rows.get(employee.id)?.days;
  expect(days?.map(({ date }) => date)).toEqual(
    Array.from({ length: 31 }, (_, index) => `2026-12-${String(index + 1).padStart(2, "0")}`),
  );
  expect(days?.slice(0, 13)).toEqual(
    Array.from({ length: 13 }, (_, index) => ({
      date: `2026-12-${String(index + 1).padStart(2, "0")}`,
      kind: "not_employed",
      bankHolidayName: null,
    })),
  );
  expect(days?.slice(13)).toEqual([
    { date: "2026-12-14", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-15", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-16", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-17", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-18", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-19", kind: "not_a_working_day", bankHolidayName: null },
    { date: "2026-12-20", kind: "not_a_working_day", bankHolidayName: null },
    { date: "2026-12-21", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-22", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-23", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-24", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-25", kind: "bank_holiday", bankHolidayName: "Christmas Day" },
    { date: "2026-12-26", kind: "not_a_working_day", bankHolidayName: null },
    { date: "2026-12-27", kind: "not_a_working_day", bankHolidayName: null },
    { date: "2026-12-28", kind: "bank_holiday", bankHolidayName: "Boxing Day" },
    { date: "2026-12-29", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-30", kind: "working_day", bankHolidayName: null },
    { date: "2026-12-31", kind: "working_day", bankHolidayName: null },
  ]);
});

test("prices each booked day using the working week in effect on that date", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-09",
    endDate: "2026-12-11",
    halfDays: [{ date: "2026-12-09", dayPart: "morning" }],
  });
  await makeThursdaysNonWorking(orm, person.employeeId);

  const rows = await whosOutService(orm).readWhosOut(OWNER, {
    employeeIds: [person.employeeId],
    from: "2026-12-01",
    until: "2026-12-31",
  });

  expect(rows.get(person.employeeId)?.timeOff[0]?.dayCosts).toEqual([
    { date: "2026-12-09", cost: 0.5, reason: "working_day" },
    { date: "2026-12-10", cost: 0, reason: "not_a_working_day" },
    { date: "2026-12-11", cost: 1, reason: "working_day" },
  ]);
});

test("reports eight deducted days after the ledger gives back two Thursdays", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-18",
  });
  await makeThursdaysNonWorking(orm, person.employeeId);
  const calendar = whosOutService(orm);
  const range = { employeeIds: [person.employeeId], from: "2026-12-07", until: "2026-12-18" };
  const before = await calendar.readWhosOut(OWNER, range);
  expect(before.get(person.employeeId)?.timeOff).toMatchObject([{ cost: 8, deductedDays: 10 }]);

  const engine = timeOffService(orm, { today: "2026-11-27" });
  await transact((tx) =>
    engine.ensureAllowances(SYSTEM, tx, {
      employeeIds: [person.employeeId],
      cause: { kind: "WORKING_PATTERN_CHANGED", ref: "2026-11-27" },
    }),
  );

  const after = await calendar.readWhosOut(OWNER, range);
  expect(after.get(person.employeeId)?.timeOff).toMatchObject([{ deductedDays: 8 }]);
});

test("shows no allowance deduction for a request awaiting approval", async ({ orm, seed }) => {
  const { requests, requester, input } = await leaveRequestSetup(orm, seed);
  const request = await requests.requestTimeOff(requester, input);

  const rows = await whosOutService(orm).readWhosOut(requester, {
    employeeIds: [input.employeeId],
    from: input.startDate,
    until: input.endDate,
  });

  expect(rows.get(input.employeeId)?.timeOff).toMatchObject([
    { id: request.id, deductedDays: null },
  ]);
});

test("shows no allowance deduction for approved record-only Sickness", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "sickness" }] });
  const sickness = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!;
  const booked = await bookTimeOffService(orm).bookTimeOff(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: sickness.id,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });

  const rows = await whosOutService(orm).readWhosOut(OWNER, {
    employeeIds: [employee.id],
    from: "2026-12-07",
    until: "2026-12-07",
  });

  expect(rows.get(employee.id)?.timeOff).toMatchObject([{ id: booked.id, deductedDays: null }]);
});

test("shows a colleague Annual leave's type and days but hides its details", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const peer = await seed.employee();
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
  const annual = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "annual_leave",
  )!;
  const service = bookTimeOffService(orm);
  const booked = await service.bookTimeOff(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: annual.id,
    startDate: "2026-12-07",
    endDate: "2026-12-08",
    halfDays: [{ date: "2026-12-08", dayPart: "morning" }],
    note: "Family visit",
  });
  const colleague = signedIn(orm, { employeeId: peer.id, profiles: ["EMPLOYEE"] });

  const rows = await whosOutService(orm).readWhosOut(colleague, {
    employeeIds: [employee.id],
    from: "2026-12-01",
    until: "2026-12-31",
  });

  expect(rows.get(employee.id)?.timeOff).toMatchObject([
    {
      id: booked.id,
      timeOffTypeId: annual.id,
      days: [
        { date: "2026-12-07", dayPart: "full_day" },
        { date: "2026-12-08", dayPart: "morning" },
      ],
      dayCosts: null,
      deductedDays: null,
      cost: null,
      note: null,
      bookedAt: null,
    },
  ]);
});

test("hides a colleague's private Sickness type", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const peer = await seed.employee();
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ recordOnly: "sickness" }],
  });
  const sickness = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!;
  const service = bookTimeOffService(orm);
  const booked = await service.bookTimeOff(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: sickness.id,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
    note: "Recovering",
  });
  const colleague = signedIn(orm, { employeeId: peer.id, profiles: ["EMPLOYEE"] });

  const rows = await whosOutService(orm).readWhosOut(colleague, {
    employeeIds: [employee.id],
    from: "2026-12-01",
    until: "2026-12-31",
  });

  expect(rows.get(employee.id)?.timeOff).toMatchObject([
    {
      id: booked.id,
      timeOffTypeId: null,
      days: [{ date: "2026-12-07", dayPart: "full_day" }],
      cost: null,
      note: null,
      bookedAt: null,
    },
  ]);
});

test.for(["self", "manager"] as const)(
  "shows private type, cost and note to the %s",
  async (reader, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate: "2025-01-01" });
    const manager = await seed.employee();
    await seed.manager(employee.id, manager.id);
    await giveTermsPolicies(orm, transact, {
      termsId: await seed.defaultTermsId(),
      policies: [{ recordOnly: "sickness" }],
    });
    const sickness = (await orm.select().from(timeOffTypes)).find(
      ({ typeKey }) => typeKey === "sickness",
    )!;
    const service = bookTimeOffService(orm);
    const booked = await service.bookTimeOff(OWNER, {
      employeeId: employee.id,
      timeOffTypeId: sickness.id,
      startDate: "2026-12-07",
      endDate: "2026-12-07",
      note: "Recovering",
    });
    const ctx = signedIn(orm, {
      employeeId: reader === "self" ? employee.id : manager.id,
      profiles: ["EMPLOYEE"],
    });

    const rows = await whosOutService(orm).readWhosOut(ctx, {
      employeeIds: [employee.id],
      from: "2026-12-01",
      until: "2026-12-31",
    });

    expect(rows.get(employee.id)?.timeOff).toMatchObject([
      {
        id: booked.id,
        timeOffTypeId: sickness.id,
        days: [{ date: "2026-12-07", dayPart: "full_day" }],
        status: "approved",
        cost: 1,
        note: "Recovering",
        bookedAt: expect.any(Date) as unknown,
      },
    ]);
  },
);

test("omits a cancelled booking from who's out", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const booked = await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });
  await service.cancelTimeOff(OWNER, { timeOffId: booked.id });

  const rows = await whosOutService(orm).readWhosOut(OWNER, {
    employeeIds: [person.employeeId],
    from: "2026-12-01",
    until: "2026-12-31",
  });

  expect(rows.get(person.employeeId)?.timeOff).toEqual([]);
});

async function makeThursdaysNonWorking(orm: Orm, employeeId: string) {
  const pattern = await seedWorkingPattern(orm, { minutes: [450, 450, 450, 0, 450, 0, 0] });
  await seedOwnWeek(orm, { employeeId, versionId: pattern.versionId, startDate: "2026-11-27" });
}
