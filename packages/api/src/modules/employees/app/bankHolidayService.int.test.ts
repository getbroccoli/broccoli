import { bankHolidayService, expect, OWNER, test } from "#test/support";

test("England and Wales has its eight named bank holidays in 2026", async () => {
  const holidays = await bankHolidayService().readBankHolidays(OWNER, {
    calendars: ["england_and_wales"],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(holidays).toEqual([
    { calendar: "england_and_wales", date: "2026-01-01", name: "New Year’s Day" },
    { calendar: "england_and_wales", date: "2026-04-03", name: "Good Friday" },
    { calendar: "england_and_wales", date: "2026-04-06", name: "Easter Monday" },
    { calendar: "england_and_wales", date: "2026-05-04", name: "Early May bank holiday" },
    { calendar: "england_and_wales", date: "2026-05-25", name: "Spring bank holiday" },
    { calendar: "england_and_wales", date: "2026-08-31", name: "Summer bank holiday" },
    { calendar: "england_and_wales", date: "2026-12-25", name: "Christmas Day" },
    { calendar: "england_and_wales", date: "2026-12-28", name: "Boxing Day" },
  ]);
});

test("Scotland has its ten bank holidays in 2026", async () => {
  const holidays = await bankHolidayService().readBankHolidays(OWNER, {
    calendars: ["scotland"],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(holidays.map(({ date }) => date)).toEqual([
    "2026-01-01",
    "2026-01-02",
    "2026-04-03",
    "2026-05-04",
    "2026-05-25",
    "2026-06-15",
    "2026-08-03",
    "2026-11-30",
    "2026-12-25",
    "2026-12-28",
  ]);
});

test("bank holiday reads include both period bounds and exclude dates outside them", async () => {
  const holidays = await bankHolidayService().readBankHolidays(OWNER, {
    calendars: ["england_and_wales"],
    from: "2026-04-03",
    until: "2026-04-06",
  });

  expect(holidays).toEqual([
    { calendar: "england_and_wales", date: "2026-04-03", name: "Good Friday" },
    { calendar: "england_and_wales", date: "2026-04-06", name: "Easter Monday" },
  ]);
});

test("bank holidays from several calendars are ordered by date then calendar", async () => {
  const holidays = await bankHolidayService().readBankHolidays(OWNER, {
    calendars: ["scotland", "england_and_wales"],
    from: "2026-01-01",
    until: "2026-01-02",
  });

  expect(holidays).toEqual([
    { calendar: "england_and_wales", date: "2026-01-01", name: "New Year’s Day" },
    { calendar: "scotland", date: "2026-01-01", name: "New Year’s Day" },
    { calendar: "scotland", date: "2026-01-02", name: "2nd January" },
  ]);
});

test("bank holiday reads refuse an invalid start date", async () => {
  await expect(
    bankHolidayService().readBankHolidays(OWNER, {
      calendars: ["england_and_wales"],
      from: "2026-02-30",
      until: "2026-12-31",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "from", code: "invalid" }],
  });
});
