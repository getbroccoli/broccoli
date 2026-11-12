process.env.TZ = "America/Los_Angeles";

import { expect, it } from "vitest";

import { formatCalendarDate } from "./formatDate";

it("formats the calendar day as DD/MM/YYYY west of UTC", () => {
  const formatted = formatCalendarDate("2024-03-04");

  expect(formatted).toBe("04/03/2024");
});

it("returns null without a date", () => {
  const formatted = formatCalendarDate(null);

  expect(formatted).toBeNull();
});

it("displays year 0001 as year 1 rather than 1901", () => {
  expect(Number(formatCalendarDate("0001-01-01")!.split("/")[2])).toBe(1);
});
