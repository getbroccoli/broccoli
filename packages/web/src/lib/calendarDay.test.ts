process.env.TZ = "America/Los_Angeles";

import { expect, it } from "vitest";

import { addDays, calendarDayOf, utcDay } from "./calendarDay";

it("adds and subtracts days across month end", () => {
  expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
  expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
});

it("adds and subtracts days through leap day", () => {
  expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  expect(addDays("2024-02-29", -1)).toBe("2024-02-28");
});

it("adds and subtracts days across year end", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
});

it("leaves the first-century year unchanged when adding zero", () => {
  expect(addDays("0001-01-01", 0)).toBe("0001-01-01");
});

it("keeps the four-digit year in a calendar date before year 1000", () => {
  expect(calendarDayOf(new Date("0100-01-01T00:00:00Z"), "UTC")).toBe("0100-01-01");
});

it("round-trips a calendar date before year 1000 through UTC midnight", () => {
  const day = utcDay(calendarDayOf(new Date("0999-06-01T12:00:00Z"), "UTC"));

  expect(day.toISOString()).toBe("0999-06-01T00:00:00.000Z");
});
