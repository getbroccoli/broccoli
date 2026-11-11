import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import {
  cancelOwnChange,
  type OwnStretch,
  withOwnStretch,
  withoutOwnStretches,
} from "./ownStretches";
import type { PatternWeek } from "./workingPattern";

it("ends the covering own week the day before and runs the new week to its end", () => {
  const weeks: OwnStretch<PatternWeek>[] = [
    {
      startDate: "2026-03-01" as CalendarDate,
      endDate: "2026-12-31" as CalendarDate,
      value: weekA,
    },
  ];

  const changed = withOwnStretch(weeks, "2026-12-01" as CalendarDate, weekB);

  expect(changed).toEqual([
    { startDate: "2026-03-01", endDate: "2026-11-30", value: weekA },
    { startDate: "2026-12-01", endDate: "2026-12-31", value: weekB },
  ]);
});

it("runs an own week set before a later stretch up to the day before it", () => {
  const weeks: OwnStretch<PatternWeek>[] = [
    { startDate: "2026-12-15" as CalendarDate, endDate: null, value: weekB },
  ];

  const changed = withOwnStretch(weeks, "2026-12-01" as CalendarDate, weekA);

  expect(changed).toEqual([
    { startDate: "2026-12-01", endDate: "2026-12-14", value: weekA },
    { startDate: "2026-12-15", endDate: null, value: weekB },
  ]);
});

it("ends the covering own week and drops later ones when returning to the terms", () => {
  const weeks: OwnStretch<PatternWeek>[] = [
    {
      startDate: "2026-03-01" as CalendarDate,
      endDate: "2026-11-30" as CalendarDate,
      value: weekA,
    },
    { startDate: "2026-12-01" as CalendarDate, endDate: null, value: weekB },
  ];

  const changed = withoutOwnStretches(weeks, "2026-11-20" as CalendarDate);

  expect(changed).toEqual([{ startDate: "2026-03-01", endDate: "2026-11-19", value: weekA }]);
});

it("refuses returning to the terms with no own week on or after the date", () => {
  const weeks: OwnStretch<PatternWeek>[] = [
    {
      startDate: "2026-03-01" as CalendarDate,
      endDate: "2026-10-31" as CalendarDate,
      value: weekA,
    },
  ];

  expect(() => withoutOwnStretches(weeks, "2026-11-20" as CalendarDate)).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "startDate", code: "none_of_their_own" }],
    }),
  );
});

it("runs the preceding own week to the cancelled change's end", () => {
  const weeks: OwnStretch<PatternWeek>[] = [
    {
      startDate: "2026-03-01" as CalendarDate,
      endDate: "2026-11-30" as CalendarDate,
      value: weekA,
    },
    {
      startDate: "2026-12-01" as CalendarDate,
      endDate: "2026-12-31" as CalendarDate,
      value: weekB,
    },
  ];

  const cancelled = cancelOwnChange(
    weeks,
    "2026-12-01" as CalendarDate,
    "2026-11-09" as CalendarDate,
  );

  expect(cancelled).toEqual({
    stretches: [{ startDate: "2026-03-01", endDate: "2026-12-31", value: weekA }],
    cancelled: weekB,
  });
});

it("extends the preceding own week to the next one when a return is cancelled", () => {
  const weeks: OwnStretch<PatternWeek>[] = [
    {
      startDate: "2026-03-01" as CalendarDate,
      endDate: "2026-11-30" as CalendarDate,
      value: weekA,
    },
    { startDate: "2027-01-01" as CalendarDate, endDate: null, value: weekB },
  ];

  const cancelled = cancelOwnChange(
    weeks,
    "2026-12-01" as CalendarDate,
    "2026-11-09" as CalendarDate,
  );

  expect(cancelled).toEqual({
    stretches: [
      { startDate: "2026-03-01", endDate: "2026-12-31", value: weekA },
      { startDate: "2027-01-01", endDate: null, value: weekB },
    ],
    cancelled: null,
  });
});

it.each(["2026-11-08", "2026-11-09"])(
  "refuses cancelling a change on %s that has already started",
  (startDate) => {
    const weeks: OwnStretch<PatternWeek>[] = [
      { startDate: startDate as CalendarDate, endDate: null, value: weekA },
    ];

    expect(() =>
      cancelOwnChange(weeks, startDate as CalendarDate, "2026-11-09" as CalendarDate),
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
