import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import type { PatternVersion, WeekdayMinutes } from "./workingPattern";
import { createPersonTimeline, type TimelineCreateInputArgs } from "./personTimeline";
import { workingWeeksOf } from "./workingPatternTimeline";

it("has no working week before and after a person's own pattern", () => {
  const short = version([240, 0, 0, 0, 0, 0, 0], 240);
  const timeline = timelineOf({
    direct: [{ id: "short", startDate: day("2026-09-01"), endDate: day("2026-09-30") }],
    versions: { short: [short] },
  });
  expect(workingWeeksOf(timeline, day("2026-08-01"), day("2026-10-31"))).toEqual([
    noWeek("2026-08-01"),
    week(short, "2026-09-01"),
    noWeek("2026-10-01"),
  ]);
});

it("has no working week outside a person's terms", () => {
  const standard = version([450, 0, 0, 0, 0, 0, 0], 450);
  const timeline = timelineOf({
    terms: [{ termsId: "terms", startDate: day("2026-09-01"), endDate: day("2026-09-30") }],
    termsPattern: "standard",
    versions: { standard: [standard] },
  });
  expect(workingWeeksOf(timeline, day("2026-08-01"), day("2026-10-31"))).toEqual([
    noWeek("2026-08-01"),
    week(standard, "2026-09-01"),
    noWeek("2026-10-01"),
  ]);
});

it("merges identical weeks across an own pattern and a pattern change", () => {
  const standard = version([450, 0, 0, 0, 0, 0, 0], 450);
  const timeline = timelineOf({
    direct: [{ id: "short", startDate: day("2026-09-01"), endDate: day("2026-09-30") }],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    termsPattern: "standard",
    versions: {
      standard: [standard],
      short: [
        version([450, 0, 0, 0, 0, 0, 0], 450, null, day("2026-09-14")),
        version([450, 0, 0, 0, 0, 0, 0], 450, day("2026-09-15")),
      ],
    },
  });
  expect(workingWeeksOf(timeline, day("2026-08-01"), day("2026-10-31"))).toEqual([
    week(standard, "2026-08-01"),
  ]);
});

it("splits when weekday minutes or full day minutes change within the requested period", () => {
  const versions = [
    version([450, 0, 0, 0, 0, 0, 0], 450, null, day("2026-09-04")),
    version([240, 0, 0, 0, 0, 0, 0], 450, day("2026-09-05"), day("2026-09-14")),
    version([240, 0, 0, 0, 0, 0, 0], 480, day("2026-09-15"), day("2026-09-20")),
    version([480, 0, 0, 0, 0, 0, 0], 480, day("2026-09-21")),
  ];
  const timeline = timelineOf({
    direct: [{ id: "short", startDate: day("2026-09-01"), endDate: day("2026-09-30") }],
    versions: { short: versions },
  });
  expect(workingWeeksOf(timeline, day("2026-09-01"), day("2026-09-15"))).toEqual([
    week(versions[0]!, "2026-09-01"),
    week(versions[1]!, "2026-09-05"),
    week(versions[2]!, "2026-09-15"),
  ]);
  expect(workingWeeksOf(timeline, day("2026-09-10"), day("2026-09-20"))).toEqual([
    week(versions[1]!, "2026-09-10"),
    week(versions[2]!, "2026-09-15"),
  ]);
});

it("has no working week without an own pattern or terms", () => {
  expect(workingWeeksOf(timelineOf({}), day("2026-09-01"), day("2026-09-30"))).toEqual([
    noWeek("2026-09-01"),
  ]);
});

function timelineOf({
  direct = [],
  terms = [],
  termsPattern = null,
  versions = {},
}: {
  direct?: TimelineCreateInputArgs<PatternVersion>["direct"];
  terms?: TimelineCreateInputArgs<PatternVersion>["terms"];
  termsPattern?: string | null;
  versions?: Record<string, PatternVersion[]>;
}) {
  return createPersonTimeline({
    direct,
    terms,
    idOfTerms: () => termsPattern,
    versions: (id) => versions[id] ?? [],
  });
}

function version(
  minutes: WeekdayMinutes,
  fullDayMinutes: number,
  startDate: CalendarDate | null = null,
  endDate: CalendarDate | null = null,
): PatternVersion {
  return {
    id: `${startDate}`,
    startDate,
    endDate,
    minutes,
    fullDayMinutes,
    bankHolidayCalendar: "england_and_wales",
  };
}

function week({ minutes, fullDayMinutes, bankHolidayCalendar }: PatternVersion, startDate: string) {
  return { startDate, minutes, fullDayMinutes, bankHolidayCalendar };
}

function noWeek(startDate: string) {
  return { startDate, minutes: null, fullDayMinutes: null, bankHolidayCalendar: null };
}

function day(value: string): CalendarDate {
  return value as CalendarDate;
}
