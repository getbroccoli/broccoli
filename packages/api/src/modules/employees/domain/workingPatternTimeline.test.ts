import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import type { PatternVersion, WeekdayMinutes } from "./workingPattern";
import { createPersonTimeline, type TimelineCreateInputArgs } from "./personTimeline";
import { workingWeeksOf } from "./workingPatternTimeline";

it("has no working week before and after a person's own assignment", () => {
  const short = version("short", [240, 0, 0, 0, 0, 0, 0]);
  const timeline = timelineOf({
    direct: [assignment("short", "2026-09-01", "2026-09-30")],
    versions: { short },
  });

  expect(workingWeeksOf(timeline, day("2026-08-01"), day("2026-10-31"))).toEqual([
    noWeek("2026-08-01"),
    week(short, "2026-09-01"),
    noWeek("2026-10-01"),
  ]);
});

it("has no working week outside a person's terms", () => {
  const standard = version("standard", [450, 0, 0, 0, 0, 0, 0]);
  const timeline = timelineOf({
    terms: [{ termsId: "terms", startDate: day("2026-09-01"), endDate: day("2026-09-30") }],
    termsAssignments: [assignment("standard", "2026-01-01")],
    versions: { standard },
  });

  expect(workingWeeksOf(timeline, day("2026-08-01"), day("2026-10-31"))).toEqual([
    noWeek("2026-08-01"),
    week(standard, "2026-09-01"),
    noWeek("2026-10-01"),
  ]);
});

it("merges identical weeks across direct and inherited assignments", () => {
  const standard = version("standard", [450, 0, 0, 0, 0, 0, 0]);
  const timeline = timelineOf({
    direct: [
      assignment("first", "2026-09-01", "2026-09-14"),
      assignment("next", "2026-09-15", "2026-09-30"),
    ],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    termsAssignments: [assignment("standard", "2026-01-01")],
    versions: {
      standard,
      first: version("first", standard.minutes),
      next: version("next", standard.minutes),
    },
  });

  expect(workingWeeksOf(timeline, day("2026-08-01"), day("2026-10-31"))).toEqual([
    week(standard, "2026-08-01"),
  ]);
});

it("splits when weekday minutes change within the requested period", () => {
  const first = version("first", [450, 0, 0, 0, 0, 0, 0]);
  const second = version("second", [240, 0, 0, 0, 0, 0, 0]);
  const third = version("third", [300, 0, 0, 0, 0, 0, 0]);
  const last = version("last", [480, 0, 0, 0, 0, 0, 0]);
  const timeline = timelineOf({
    direct: [
      assignment("first", "2026-09-01", "2026-09-04"),
      assignment("second", "2026-09-05", "2026-09-14"),
      assignment("third", "2026-09-15", "2026-09-20"),
      assignment("last", "2026-09-21", "2026-09-30"),
    ],
    versions: { first, second, third, last },
  });

  expect(workingWeeksOf(timeline, day("2026-09-01"), day("2026-09-15"))).toEqual([
    week(first, "2026-09-01"),
    week(second, "2026-09-05"),
    week(third, "2026-09-15"),
  ]);
  expect(workingWeeksOf(timeline, day("2026-09-10"), day("2026-09-20"))).toEqual([
    week(second, "2026-09-10"),
    week(third, "2026-09-15"),
  ]);
});

it("has no working week without an own assignment or terms", () => {
  expect(workingWeeksOf(timelineOf({}), day("2026-09-01"), day("2026-09-30"))).toEqual([
    noWeek("2026-09-01"),
  ]);
});

function timelineOf({
  direct = [],
  terms = [],
  termsAssignments = [],
  versions = {},
}: {
  direct?: TimelineCreateInputArgs<PatternVersion>["direct"];
  terms?: TimelineCreateInputArgs<PatternVersion>["terms"];
  termsAssignments?: TimelineCreateInputArgs<PatternVersion>["direct"];
  versions?: Record<string, PatternVersion>;
}) {
  return createPersonTimeline({
    direct,
    terms,
    termsAssignments: () => termsAssignments,
    version: (id) => versions[id]!,
  });
}

function version(id: string, minutes: WeekdayMinutes): PatternVersion {
  return {
    id,
    workingPatternId: "pattern",
    status: "published",
    termsId: null,
    revision: 1,
    minutes,
    bankHolidayCalendar: "england_and_wales",
  };
}

function assignment(versionId: string, startDate: string, endDate: string | null = null) {
  return { versionId, startDate: day(startDate), endDate: endDate === null ? null : day(endDate) };
}

function week({ minutes, bankHolidayCalendar }: PatternVersion, startDate: string) {
  return { startDate, minutes, bankHolidayCalendar };
}

function noWeek(startDate: string) {
  return { startDate, minutes: null, bankHolidayCalendar: null };
}
function day(value: string): CalendarDate {
  return value as CalendarDate;
}
