process.env.TZ = "America/Los_Angeles";

import { expect, it } from "vitest";

import { formatCalendarDate } from "./formatDate";

it("keeps the calendar day west of UTC", () => {
  const expected = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(2024, 2, 4));

  const formatted = formatCalendarDate("2024-03-04");

  expect(formatted).toBe(expected);
});

it("returns null without a date", () => {
  const formatted = formatCalendarDate(null);

  expect(formatted).toBeNull();
});
