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
