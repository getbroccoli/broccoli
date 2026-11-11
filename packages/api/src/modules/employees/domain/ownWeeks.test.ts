import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import { cancelOwnWeekChange, withOwnWeek, withoutOwnWeeks, type OwnWeek } from "./ownWeeks";
import type { PatternWeek } from "./workingPattern";

it("ends the covering own week the day before and runs the new week to its end", () => {
  const weeks: OwnWeek[] = [
    { startDate: "2026-03-01" as CalendarDate, endDate: "2026-12-31" as CalendarDate, week: weekA },
  ];

  const changed = withOwnWeek(weeks, "2026-12-01" as CalendarDate, weekB);

  expect(changed).toEqual([
    { startDate: "2026-03-01", endDate: "2026-11-30", week: weekA },
    { startDate: "2026-12-01", endDate: "2026-12-31", week: weekB },
  ]);
});

it("runs an own week set before a later stretch up to the day before it", () => {
  const weeks: OwnWeek[] = [
    { startDate: "2026-12-15" as CalendarDate, endDate: null, week: weekB },
  ];

  const changed = withOwnWeek(weeks, "2026-12-01" as CalendarDate, weekA);

  expect(changed).toEqual([
    { startDate: "2026-12-01", endDate: "2026-12-14", week: weekA },
    { startDate: "2026-12-15", endDate: null, week: weekB },
  ]);
});

it("ends the covering own week and drops later ones when returning to the terms", () => {
  const weeks: OwnWeek[] = [
    { startDate: "2026-03-01" as CalendarDate, endDate: "2026-11-30" as CalendarDate, week: weekA },
    { startDate: "2026-12-01" as CalendarDate, endDate: null, week: weekB },
  ];

  const changed = withoutOwnWeeks(weeks, "2026-11-20" as CalendarDate);

  expect(changed).toEqual([{ startDate: "2026-03-01", endDate: "2026-11-19", week: weekA }]);
});

it("refuses returning to the terms with no own week on or after the date", () => {
  const weeks: OwnWeek[] = [
    { startDate: "2026-03-01" as CalendarDate, endDate: "2026-10-31" as CalendarDate, week: weekA },
  ];

  expect(() => withoutOwnWeeks(weeks, "2026-11-20" as CalendarDate)).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "startDate", code: "no_own_week" }],
    }),
  );
});

it("runs the preceding own week to the cancelled change's end", () => {
  const weeks: OwnWeek[] = [
    { startDate: "2026-03-01" as CalendarDate, endDate: "2026-11-30" as CalendarDate, week: weekA },
    { startDate: "2026-12-01" as CalendarDate, endDate: "2026-12-31" as CalendarDate, week: weekB },
  ];

  const cancelled = cancelOwnWeekChange(
    weeks,
    "2026-12-01" as CalendarDate,
    "2026-11-09" as CalendarDate,
  );

  expect(cancelled).toEqual({
    weeks: [{ startDate: "2026-03-01", endDate: "2026-12-31", week: weekA }],
    cancelled: weekB,
  });
});

it("extends the preceding own week to the next one when a return is cancelled", () => {
  const weeks: OwnWeek[] = [
    { startDate: "2026-03-01" as CalendarDate, endDate: "2026-11-30" as CalendarDate, week: weekA },
    { startDate: "2027-01-01" as CalendarDate, endDate: null, week: weekB },
  ];

  const cancelled = cancelOwnWeekChange(
    weeks,
    "2026-12-01" as CalendarDate,
    "2026-11-09" as CalendarDate,
  );

  expect(cancelled).toEqual({
    weeks: [
      { startDate: "2026-03-01", endDate: "2026-12-31", week: weekA },
      { startDate: "2027-01-01", endDate: null, week: weekB },
    ],
    cancelled: null,
  });
});

it.each(["2026-11-08", "2026-11-09"])(
  "refuses cancelling a change on %s that has already started",
  (startDate) => {
    const weeks: OwnWeek[] = [{ startDate: startDate as CalendarDate, endDate: null, week: weekA }];

    expect(() =>
      cancelOwnWeekChange(weeks, startDate as CalendarDate, "2026-11-09" as CalendarDate),
    ).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
  },
);

const weekA: PatternWeek = {
  minutes: [420, 420, 420, 420, 420, 0, 0],
  bankHolidayCalendar: "england_and_wales",
};
const weekB: PatternWeek = {
  minutes: [480, 480, 480, 480, 0, 0, 0],
  bankHolidayCalendar: "scotland",
};
