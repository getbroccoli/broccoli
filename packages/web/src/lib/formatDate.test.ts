process.env.TZ = "America/Los_Angeles";

import { expect, it } from "vitest";

import { bookingDates, formatCalendarDate } from "./formatDate";

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

it.each([
  ["2026-12-07", "2026-12-09", "7–9 Dec 2026"],
  ["2026-12-30", "2027-01-04", "30 Dec 2026 – 4 Jan 2027"],
  ["2026-11-03", "2026-11-03", "3 Nov 2026"],
  ["2026-11-30", "2026-12-02", "30 Nov – 2 Dec 2026"],
])("formats booking dates from %s to %s as %s", (startDate, endDate, expected) => {
  expect(bookingDates(startDate, endDate)).toBe(expected);
});
