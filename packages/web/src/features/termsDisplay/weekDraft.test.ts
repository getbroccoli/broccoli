import { expect, it } from "vitest";

import { type WeekDraft, weekErrors, weekHint } from "./weekDraft";

it("accepts working hours in quarter-hour steps", () => {
  expect(weekErrors({ ...week, hours: ["7.25", "0", "0", "0", "0", "0", "0"] })).toEqual({});
});

it("refuses working hours between quarter-hour steps", () => {
  expect(weekErrors({ ...week, hours: ["7.3", "0", "0", "0", "0", "0", "0"] })).toEqual({
    hours: "Enter hours from 0 to 24, in quarter hours.",
  });
});

it("requires at least one working day", () => {
  expect(weekErrors({ ...week, hours: ["0", "0", "0", "0", "0", "0", "0"] })).toEqual({
    hours: "At least one day needs hours.",
  });
});

it("compares the new working week's hours and days with the old week", () => {
  expect(weekHint(week, currentWeek)).toBe("32 hours a week, over 4 days. Was Mon–Fri, 7.5 hours.");
});

const week: WeekDraft = {
  hours: ["8", "8", "8", "8", "0", "0", "0"],
  calendar: "SCOTLAND",
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
