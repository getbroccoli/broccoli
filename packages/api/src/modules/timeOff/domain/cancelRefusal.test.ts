import { expect, it } from "vitest";
import { calendarDate } from "#test/support";
import { cancelRefusal } from "../domain";

it.each([
  ["requested", "2026-11-25", true, null],
  ["approved", "2026-11-27", true, null],
  ["approved", "2026-11-26", true, "time_off_has_started"],
  ["approved", "2026-11-25", true, "time_off_has_started"],
  ["requested", "2026-11-27", false, "time_off_was_booked_by_someone_else"],
  ["approved", "2026-11-27", false, "time_off_was_booked_by_someone_else"],
  ["rejected", "2026-11-25", false, "time_off_was_rejected"],
  ["cancelled", "2026-11-25", false, "time_off_is_already_cancelled"],
] as const)(
  "checks the person's %s time off starting %s, booked by them %s",
  (status, date, bookedByCaller, expected) => {
    expect(
      cancelRefusal({
        status,
        firstDate: calendarDate(date),
        today: calendarDate("2026-11-26"),
        ownRules: true,
        bookedByCaller,
      }),
    ).toBe(expected);
  },
);

it.each([
  ["requested", null],
  ["approved", null],
  ["rejected", "time_off_was_rejected"],
  ["cancelled", "time_off_is_already_cancelled"],
] as const)(
  "checks an admin cancelling %s time off someone else booked in the past",
  (status, expected) => {
    expect(
      cancelRefusal({
        status,
        firstDate: calendarDate("2026-11-25"),
        today: calendarDate("2026-11-26"),
        ownRules: false,
        bookedByCaller: false,
      }),
    ).toBe(expected);
  },
);
