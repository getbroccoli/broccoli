import { expect, it } from "vitest";

import {
  bulkGroups,
  bulkLines,
  bulkSavedToast,
  bulkSaveLine,
  bulkTitle,
  peopleList,
} from "./bulkChangeTermsText";

it.each([
  { names: ["Priya Shah"], expected: "Priya Shah" },
  { names: ["Priya Shah", "Tom Reed"], expected: "Priya Shah and Tom Reed" },
  { names: ["A", "B", "C"], expected: "A, B and C" },
  { names: ["A", "B", "C", "D", "E"], expected: "A, B, C and 2 more" },
])("lists $names as '$expected'", ({ names, expected }) => {
  const text = peopleList(names);

  expect(text).toBe(expected);
});

it("groups a person who is already on the chosen terms", () => {
  const skipped = [
    {
      employee: { firstName: "Priya", lastName: "Shah" },
      reason: "ALREADY_ON_TERMS" as const,
    },
  ];

  const groups = bulkGroups({ moves: [], skipped, startDate: "2026-12-01" });

  expect(groups).toEqual({ ...emptyGroups, alreadyOn: ["Priya Shah"] });
});

it("groups a person who left before the move date", () => {
  const skipped = [
    {
      employee: { firstName: "Alex", lastName: "Morgan" },
      reason: "LEFT_BEFORE_DATE" as const,
    },
  ];

  const groups = bulkGroups({ moves: [], skipped, startDate: "2026-12-01" });

  expect(groups).toEqual({ ...emptyGroups, left: ["Alex Morgan"] });
});

it("groups a person whose move waits until their later start date", () => {
  const later = {
    ...move,
    employee: { firstName: "Jo", lastName: "Clarke" },
    startDate: "2027-01-10",
  };

  const groups = bulkGroups({ moves: [later], skipped: [], startDate: "2026-12-01" });

  expect(groups).toEqual({ ...emptyGroups, moving: 1, startLater: ["Jo Clarke"] });
});

it("groups a person who keeps their own working week on the move date", () => {
  const ownWeek = {
    ...move,
    employmentTerms: {
      ...move.employmentTerms,
      workingWeek: [{ source: "THEIR_OWN" as const, startDate: "2026-12-01", endDate: null }],
    },
  };

  const groups = bulkGroups({ moves: [ownWeek], skipped: [], startDate: "2026-12-01" });

  expect(groups).toEqual({ ...emptyGroups, moving: 1, keepOwn: ["Sam Patel"] });
});

it("groups a person who keeps their own time off rules on the move date", () => {
  const ownRules = {
    ...move,
    employmentTerms: {
      ...move.employmentTerms,
      timeOff: [
        { versions: [{ source: "THEIR_OWN" as const, startDate: "2026-12-01", endDate: null }] },
      ],
    },
  };

  const groups = bulkGroups({ moves: [ownRules], skipped: [], startDate: "2026-12-01" });

  expect(groups).toEqual({ ...emptyGroups, moving: 1, keepOwn: ["Sam Patel"] });
});

it("names the first later terms move that stays", () => {
  const later = {
    ...move,
    employee: { firstName: "Jo", lastName: "Clarke" },
    employmentTerms: {
      ...move.employmentTerms,
      periods: [
        ...move.employmentTerms.periods,
        { termsName: "Northern Ireland", startDate: "2027-02-01" },
        { termsName: "Scotland", startDate: "2027-03-01" },
      ],
    },
  };

  const groups = bulkGroups({ moves: [later], skipped: [], startDate: "2026-12-01" });

  expect(groups).toEqual({
    ...emptyGroups,
    moving: 1,
    laterMoves: ["Jo Clarke moves to Northern Ireland on 1 Feb 2027"],
  });
});

it("counts a plain move without adding a reason line", () => {
  const groups = bulkGroups({ moves: [move], skipped: [], startDate: "2026-12-01" });

  expect(groups).toEqual({ ...emptyGroups, moving: 1 });
});

it("shows all five applicable lines in order", () => {
  const groups = {
    moving: 4,
    alreadyOn: ["Priya Shah", "Tom Reed"],
    startLater: ["Jo Clarke"],
    left: ["Alex Morgan"],
    keepOwn: ["Sam Patel"],
    laterMoves: ["Jo Clarke moves to Northern Ireland on 1 Feb 2027"],
  };

  const lines = bulkLines({ termsName: "Scotland", startDate: "2026-12-01", groups });

  expect(lines).toEqual([
    "Already on Scotland on 1 Dec 2026, so they stay as they are: Priya Shah and Tom Reed.",
    "Start after 1 Dec 2026, so they move from their start date: Jo Clarke.",
    "Left before 1 Dec 2026, so they stay as they were: Alex Morgan.",
    "Keep their own working week or rules: Sam Patel.",
    "Have a later change that stays: Jo Clarke moves to Northern Ireland on 1 Feb 2027.",
  ]);
});

it("shows no quiet lines when no reason applies", () => {
  const lines = bulkLines({
    termsName: "Scotland",
    startDate: "2026-12-01",
    groups: { ...emptyGroups, moving: 4 },
  });

  expect(lines).toEqual([]);
});

it.each([
  { count: 6, expected: "Change terms for 6 people" },
  { count: 1, expected: "Change terms for 1 person" },
])("titles a selection of $count", ({ count, expected }) => {
  const title = bulkTitle(count);

  expect(title).toBe(expected);
});

it.each([
  { count: 4, expected: "Saving moves 4 people to Scotland from 1 Dec 2026." },
  { count: 1, expected: "Saving moves 1 person to Scotland from 1 Dec 2026." },
  { count: 0, expected: "Nobody here moves to Scotland from 1 Dec 2026." },
])("describes saving $count moves", ({ count, expected }) => {
  const line = bulkSaveLine({ count, termsName: "Scotland", startDate: "2026-12-01" });

  expect(line).toBe(expected);
});

it.each([
  { count: 4, startDate: "2026-12-01", expected: "4 people move to Scotland on 1 Dec 2026." },
  { count: 1, startDate: "2026-12-01", expected: "1 person moves to Scotland on 1 Dec 2026." },
  { count: 4, startDate: "2026-11-09", expected: "4 people are on Scotland from 9 Nov 2026." },
  { count: 1, startDate: "2026-11-09", expected: "1 person is on Scotland from 9 Nov 2026." },
  { count: 4, startDate: "2026-03-01", expected: "4 people are on Scotland from 1 Mar 2026." },
  { count: 1, startDate: "2026-03-01", expected: "1 person is on Scotland from 1 Mar 2026." },
])("confirms $count saved moves from $startDate", ({ count, startDate, expected }) => {
  const toast = bulkSavedToast({
    movedFrom: Array.from({ length: count }, () => startDate),
    termsName: "Scotland",
    startDate,
    today: "2026-11-09",
  });

  expect(toast).toBe(expected);
});

it("says only who moved when some move from a later start", () => {
  const toast = bulkSavedToast({
    movedFrom: ["2026-11-09", "2027-01-10"],
    termsName: "Scotland",
    startDate: "2026-11-09",
    today: "2026-11-09",
  });

  expect(toast).toBe("2 people moved to Scotland.");
});

const emptyGroups = {
  moving: 0,
  alreadyOn: [],
  startLater: [],
  left: [],
  keepOwn: [],
  laterMoves: [],
};

const move = {
  employee: { firstName: "Sam", lastName: "Patel" },
  startDate: "2026-12-01",
  employmentTerms: {
    periods: [{ termsName: "Scotland", startDate: "2026-12-01" }],
    workingWeek: [{ source: "FROM_THEIR_TERMS" as const, startDate: "2026-12-01", endDate: null }],
    timeOff: [],
  },
};
