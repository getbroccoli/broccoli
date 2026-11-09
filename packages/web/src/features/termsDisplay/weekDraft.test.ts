import { expect, it } from "vitest";

import { type WeekDraft, weekErrors, weekHint } from "./weekDraft";

it("accepts working hours in quarter-hour steps", () => {
  expect(
    weekErrors({ ...week, hours: ["7.25", "0", "0", "0", "0", "0", "0"] }, "2026-01-01"),
  ).toEqual({});
});

it("refuses working hours between quarter-hour steps", () => {
  expect(
    weekErrors({ ...week, hours: ["7.3", "0", "0", "0", "0", "0", "0"] }, "2026-01-01"),
  ).toEqual({ hours: "Enter hours from 0 to 24, in quarter hours." });
});

it("requires at least one working day", () => {
  expect(weekErrors({ ...week, hours: ["0", "0", "0", "0", "0", "0", "0"] }, "2026-01-01")).toEqual(
    { hours: "At least one day needs hours." },
  );
});

it("refuses a working week starting before the earliest allowed date", () => {
  expect(weekErrors({ ...week, startDate: "2025-12-31" }, "2026-01-01")).toEqual({
    startDate: "Pick a date from 1 Jan 2026.",
  });
});

it("compares the new working week's hours and days with the old week", () => {
  expect(weekHint(week, currentWeek)).toBe("32 hours a week, over 4 days. Was Mon–Fri, 7.5 hours.");
});

const week: WeekDraft = {
  hours: ["8", "8", "8", "8", "0", "0", "0"],
  calendar: "SCOTLAND",
  startDate: "2026-12-01",
};

const currentWeek = {
  mondayMinutes: 450,
  tuesdayMinutes: 450,
  wednesdayMinutes: 450,
  thursdayMinutes: 450,
  fridayMinutes: 450,
  saturdayMinutes: 0,
  sundayMinutes: 0,
};
