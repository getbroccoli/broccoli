import { bankHolidayService, expect, OWNER, test } from "#test/support";

test("England and Wales has its eight named bank holidays in 2026", async () => {
  const holidays = await bankHolidayService().readBankHolidays(OWNER, {
    calendars: ["england_and_wales"],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(holidays.get("england_and_wales")).toEqual([
    { date: "2026-01-01", name: "New Year’s Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-04", name: "Early May bank holiday" },
    { date: "2026-05-25", name: "Spring bank holiday" },
    { date: "2026-08-31", name: "Summer bank holiday" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-28", name: "Boxing Day" },
  ]);
});

test("Scotland has its ten bank holidays in 2026", async () => {
  const holidays = await bankHolidayService().readBankHolidays(OWNER, {
    calendars: ["scotland"],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(holidays.get("scotland")?.map(({ date }) => date)).toEqual([
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

  expect(holidays.get("england_and_wales")).toEqual([
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-06", name: "Easter Monday" },
  ]);
});

test("bank holidays of several calendars come back by calendar", async () => {
  const holidays = await bankHolidayService().readBankHolidays(OWNER, {
    calendars: ["scotland", "england_and_wales"],
    from: "2026-01-01",
    until: "2026-01-02",
  });

  expect(holidays).toEqual(
    new Map([
      [
        "scotland",
        [
          { date: "2026-01-01", name: "New Year’s Day" },
          { date: "2026-01-02", name: "2nd January" },
        ],
      ],
      ["england_and_wales", [{ date: "2026-01-01", name: "New Year’s Day" }]],
    ]),
  );
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
