import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import {
  coversDate,
  makeRoomForDatedPattern,
  patternOn,
  workingWeeksOf,
  type DatedPattern,
  type WorkingPatternTimeline,
} from "./workingPatternTimeline";

it("uses an own assignment on its dates, otherwise the group link on that date", () => {
  const timeline: WorkingPatternTimeline = {
    assignments: [
      {
        id: "own",
        workingPatternId: "own",
        effectiveFrom: "2026-09-10" as CalendarDate,
        effectiveUntil: "2026-09-20" as CalendarDate,
      },
    ],
    memberships: [
      {
        policyGroupId: "group",
        effectiveFrom: "2026-08-01" as CalendarDate,
        effectiveUntil: "2026-09-30" as CalendarDate,
      },
    ],
    groupPatterns: new Map([
      [
        "group",
        [
          {
            id: "old",
            workingPatternId: "standard",
            effectiveFrom: null,
            effectiveUntil: "2026-09-14" as CalendarDate,
          },
          {
            id: "new",
            workingPatternId: "short",
            effectiveFrom: "2026-09-15" as CalendarDate,
            effectiveUntil: null,
          },
        ],
      ],
    ]),
    patternWeeks: new Map(),
  };
  expect(patternOn(timeline, "2026-07-31" as CalendarDate)).toBeNull();
  expect(patternOn(timeline, "2026-09-09" as CalendarDate)).toBe("standard");
  expect(patternOn(timeline, "2026-09-15" as CalendarDate)).toBe("own");
  expect(patternOn(timeline, "2026-09-21" as CalendarDate)).toBe("short");
  expect(patternOn(timeline, "2026-10-01" as CalendarDate)).toBeNull();
});

it("splits at an assignment start and the day after its inclusive end", () => {
  const timeline: WorkingPatternTimeline = {
    assignments: [
      {
        id: "own",
        workingPatternId: "short",
        effectiveFrom: "2026-09-01" as CalendarDate,
        effectiveUntil: "2026-09-30" as CalendarDate,
      },
    ],
    memberships: [],
    groupPatterns: new Map(),
    patternWeeks: new Map([
      ["short", [{ effectiveFrom: null, minutes: [240, 0, 0, 0, 0, 0, 0], fullDayMinutes: 240 }]],
    ]),
  };
  expect(
    workingWeeksOf(timeline, "2026-08-01" as CalendarDate, "2026-10-31" as CalendarDate),
  ).toEqual([
    { effectiveFrom: "2026-08-01", minutes: null, fullDayMinutes: null },
    { effectiveFrom: "2026-09-01", minutes: [240, 0, 0, 0, 0, 0, 0], fullDayMinutes: 240 },
    { effectiveFrom: "2026-10-01", minutes: null, fullDayMinutes: null },
  ]);
});
it("splits at a group link's start and end", () => {
  const timeline: WorkingPatternTimeline = {
    assignments: [],
    memberships: [{ policyGroupId: "group", effectiveFrom: null, effectiveUntil: null }],
    groupPatterns: new Map([
      [
        "group",
        [
          {
            id: "link",
            workingPatternId: "standard",
            effectiveFrom: "2026-09-01" as CalendarDate,
            effectiveUntil: "2026-09-30" as CalendarDate,
          },
        ],
      ],
    ]),
    patternWeeks: new Map([
      [
        "standard",
        [{ effectiveFrom: null, minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 }],
      ],
    ]),
  };
  expect(
    workingWeeksOf(timeline, "2026-08-01" as CalendarDate, "2026-10-31" as CalendarDate),
  ).toEqual([
    { effectiveFrom: "2026-08-01", minutes: null, fullDayMinutes: null },
    { effectiveFrom: "2026-09-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: null, fullDayMinutes: null },
  ]);
});
it("splits at a membership's start and end", () => {
  const timeline: WorkingPatternTimeline = {
    assignments: [],
    memberships: [
      {
        policyGroupId: "group",
        effectiveFrom: "2026-09-01" as CalendarDate,
        effectiveUntil: "2026-09-30" as CalendarDate,
      },
    ],
    groupPatterns: new Map([
      [
        "group",
        [{ id: "link", workingPatternId: "standard", effectiveFrom: null, effectiveUntil: null }],
      ],
    ]),
    patternWeeks: new Map([
      [
        "standard",
        [{ effectiveFrom: null, minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 }],
      ],
    ]),
  };
  expect(
    workingWeeksOf(timeline, "2026-08-01" as CalendarDate, "2026-10-31" as CalendarDate),
  ).toEqual([
    { effectiveFrom: "2026-08-01", minutes: null, fullDayMinutes: null },
    { effectiveFrom: "2026-09-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: null, fullDayMinutes: null },
  ]);
});
it("merges identical weeks across assignment and pattern changes", () => {
  const timeline: WorkingPatternTimeline = {
    assignments: [
      {
        id: "own",
        workingPatternId: "short",
        effectiveFrom: "2026-09-01" as CalendarDate,
        effectiveUntil: "2026-09-30" as CalendarDate,
      },
    ],
    memberships: [{ policyGroupId: "group", effectiveFrom: null, effectiveUntil: null }],
    groupPatterns: new Map([
      [
        "group",
        [{ id: "link", workingPatternId: "standard", effectiveFrom: null, effectiveUntil: null }],
      ],
    ]),
    patternWeeks: new Map([
      [
        "standard",
        [{ effectiveFrom: null, minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 }],
      ],
      [
        "short",
        [
          { effectiveFrom: null, minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
          {
            effectiveFrom: "2026-09-15" as CalendarDate,
            minutes: [450, 0, 0, 0, 0, 0, 0],
            fullDayMinutes: 450,
          },
        ],
      ],
    ]),
  };
  expect(
    workingWeeksOf(timeline, "2026-08-01" as CalendarDate, "2026-10-31" as CalendarDate),
  ).toEqual([
    { effectiveFrom: "2026-08-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
  ]);
});
it("splits when weekday minutes or full day minutes change within the requested period", () => {
  const timeline: WorkingPatternTimeline = {
    assignments: [
      {
        id: "own",
        workingPatternId: "short",
        effectiveFrom: "2026-09-01" as CalendarDate,
        effectiveUntil: "2026-09-30" as CalendarDate,
      },
    ],
    memberships: [],
    groupPatterns: new Map(),
    patternWeeks: new Map([
      [
        "short",
        [
          { effectiveFrom: null, minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
          {
            effectiveFrom: "2026-09-05" as CalendarDate,
            minutes: [240, 0, 0, 0, 0, 0, 0],
            fullDayMinutes: 450,
          },
          {
            effectiveFrom: "2026-09-15" as CalendarDate,
            minutes: [240, 0, 0, 0, 0, 0, 0],
            fullDayMinutes: 480,
          },
          {
            effectiveFrom: "2026-09-21" as CalendarDate,
            minutes: [480, 0, 0, 0, 0, 0, 0],
            fullDayMinutes: 480,
          },
        ],
      ],
    ]),
  };
  expect(
    workingWeeksOf(timeline, "2026-09-01" as CalendarDate, "2026-09-15" as CalendarDate),
  ).toEqual([
    { effectiveFrom: "2026-09-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-05", minutes: [240, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-15", minutes: [240, 0, 0, 0, 0, 0, 0], fullDayMinutes: 480 },
  ]);
  expect(
    workingWeeksOf(timeline, "2026-09-10" as CalendarDate, "2026-09-20" as CalendarDate),
  ).toEqual([
    { effectiveFrom: "2026-09-10", minutes: [240, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-15", minutes: [240, 0, 0, 0, 0, 0, 0], fullDayMinutes: 480 },
  ]);
});

it("has no pattern without an assignment or a linked group", () => {
  const timeline: WorkingPatternTimeline = {
    assignments: [],
    memberships: [],
    groupPatterns: new Map(),
    patternWeeks: new Map(),
  };
  expect(
    workingWeeksOf(timeline, "2026-09-01" as CalendarDate, "2026-09-30" as CalendarDate),
  ).toEqual([{ effectiveFrom: "2026-09-01", minutes: null, fullDayMinutes: null }]);
  const unlinkedGroup: WorkingPatternTimeline = {
    ...timeline,
    memberships: [{ policyGroupId: "group", effectiveFrom: null, effectiveUntil: null }],
  };
  expect(patternOn(unlinkedGroup, "2026-09-01" as CalendarDate)).toBeNull();
});

it("ends an earlier covering row, replaces a same-date row and leaves an expired row alone", () => {
  const row: DatedPattern = {
    id: "row",
    workingPatternId: "standard",
    effectiveFrom: null,
    effectiveUntil: null,
  };
  const from = "2026-09-01" as CalendarDate;
  expect(makeRoomForDatedPattern([row], from, null)).toEqual({ ended: row, replaced: null });
  const sameDate = { ...row, effectiveFrom: from };
  expect(makeRoomForDatedPattern([sameDate], from, null)).toEqual({
    ended: null,
    replaced: sameDate,
  });
  const expired = { ...row, effectiveUntil: "2026-08-31" as CalendarDate };
  expect(makeRoomForDatedPattern([expired], from, null)).toEqual({ ended: null, replaced: null });
});

it("allows a new row only when it ends before a later row starts", () => {
  const row: DatedPattern = {
    id: "later",
    workingPatternId: "standard",
    effectiveFrom: "2026-10-01" as CalendarDate,
    effectiveUntil: null,
  };
  const from = "2026-09-01" as CalendarDate;
  const error = {
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveUntil", code: "overlaps" }],
  };
  expect(() => makeRoomForDatedPattern([row], from, "2026-10-01" as CalendarDate)).toThrow(
    expect.objectContaining(error),
  );
  expect(() => makeRoomForDatedPattern([row], from, null)).toThrow(expect.objectContaining(error));
  expect(makeRoomForDatedPattern([row], from, "2026-09-30" as CalendarDate)).toEqual({
    ended: null,
    replaced: null,
  });
});

it("covers inclusive boundaries and treats null boundaries as open", () => {
  const row = {
    effectiveFrom: "2026-09-01" as CalendarDate,
    effectiveUntil: "2026-09-30" as CalendarDate,
  };
  expect(coversDate(row, "2026-08-31" as CalendarDate)).toBe(false);
  expect(coversDate(row, "2026-09-01" as CalendarDate)).toBe(true);
  expect(coversDate(row, "2026-09-30" as CalendarDate)).toBe(true);
  expect(coversDate(row, "2026-10-01" as CalendarDate)).toBe(false);
  expect(
    coversDate({ effectiveFrom: null, effectiveUntil: null }, "2026-09-01" as CalendarDate),
  ).toBe(true);
});
