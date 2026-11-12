import { expect, test } from "vitest";

import { parseCalendarDate, weekdayOf, type CalendarDate } from "../../../utils";
import { addDayOffset } from "./dayOffset";

test("adds calendar days across a month boundary", () => {
  const result = addDayOffset(day("2026-11-30"), { amount: 3, unit: "calendar_days" }, null);

  expect(result).toBe("2026-12-03");
});

test("subtracts calendar days across a year boundary", () => {
  const result = addDayOffset(day("2027-01-02"), { amount: -3, unit: "calendar_days" }, null);

  expect(result).toBe("2026-12-30");
});

test("counts working days after the starting day and skips the weekend", () => {
  const result = addDayOffset(day("2026-12-04"), { amount: 2, unit: "business_days" }, isWeekday);

  expect(result).toBe("2026-12-08");
});

test("counts working days backwards across a weekend", () => {
  const result = addDayOffset(day("2026-12-07"), { amount: -2, unit: "business_days" }, isWeekday);

  expect(result).toBe("2026-12-03");
});

test("skips a bank holiday that falls on a working weekday", () => {
  const isWorkingDay = (date: CalendarDate) => isWeekday(date) && date !== "2026-08-31";

  const result = addDayOffset(
    day("2026-08-28"),
    { amount: 1, unit: "business_days" },
    isWorkingDay,
  );

  expect(result).toBe("2026-09-01");
});

test("a zero business offset keeps a non-working starting day", () => {
  const result = addDayOffset(day("2026-12-06"), { amount: 0, unit: "business_days" }, isWeekday);

  expect(result).toBe("2026-12-06");
});

test("counts business days as calendar days without a working pattern", () => {
  const result = addDayOffset(day("2026-12-04"), { amount: 2, unit: "business_days" }, null);

  expect(result).toBe("2026-12-06");
});

test("counts a person's own working weekdays", () => {
  const worksMondayAndThursday = (date: CalendarDate) => [0, 3].includes(weekdayOf(date));

  const result = addDayOffset(
    day("2026-12-03"),
    { amount: 3, unit: "business_days" },
    worksMondayAndThursday,
  );

  expect(result).toBe("2026-12-14");
});

function day(value: string): CalendarDate {
  return parseCalendarDate(value)!;
}

function isWeekday(date: CalendarDate): boolean {
  return weekdayOf(date) < 5;
}
