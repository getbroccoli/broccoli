import { expect, it } from "vitest";

import type { CalendarDate, CalendarDateRange } from "../../../utils";
import { createPersonTimeline } from "./personTimeline";

it("uses a direct assignment over the terms on a date it covers", () => {
  const timeline = createPersonTimeline({
    direct: [assignment("personal", "2026-06-10", "2026-06-20")],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("standard")],
  });

  expect(timeline.getVersionOnDate(date("2026-06-15"))).toBe("personal");
});

it("uses the terms' assignment without a direct assignment", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("standard")],
  });

  expect(timeline.getVersionOnDate(date("2026-06-15"))).toBe("standard");
});

it("returns null after the terms' assignment ends", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("standard", "2026-01-01", "2026-12-31")],
  });

  expect(timeline.getVersionOnDate(date("2027-01-01"))).toBeNull();
});

it("returns null for a person with no terms or direct assignment", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [],
    version: (versionId: string) => versionId,
    termsAssignments: () => [],
  });

  expect(timeline.getVersionOnDate(date("2026-06-15"))).toBeNull();
});

it("splits stretches at a terms assignment change", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [
      assignment("previous", "2026-01-01", "2026-12-31"),
      assignment("next", "2027-01-01"),
    ],
  });

  expect(timeline.getVersions(date("2026-12-01"), date("2027-01-31"))).toEqual([
    {
      versionId: "previous",
      version: "previous",
      source: "from_their_terms",
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    },
    {
      versionId: "next",
      version: "next",
      source: "from_their_terms",
      startDate: "2027-01-01",
      endDate: "2027-01-31",
    },
  ]);
});

it("returns to the terms' assignment after a direct assignment ends", () => {
  const timeline = createPersonTimeline({
    direct: [assignment("personal", "2026-06-10", "2026-06-20")],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("standard")],
  });

  expect(timeline.getVersions(date("2026-06-01"), date("2026-06-30"))).toEqual([
    {
      versionId: "standard",
      version: "standard",
      source: "from_their_terms",
      startDate: "2026-06-01",
      endDate: "2026-06-09",
    },
    {
      versionId: "personal",
      version: "personal",
      source: "their_own",
      startDate: "2026-06-10",
      endDate: "2026-06-20",
    },
    {
      versionId: "standard",
      version: "standard",
      source: "from_their_terms",
      startDate: "2026-06-21",
      endDate: "2026-06-30",
    },
  ]);
});

it("uses the new terms' assignment after a membership change", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [
      { termsId: "england", startDate: null, endDate: date("2026-06-15") },
      { termsId: "scotland", startDate: date("2026-06-16"), endDate: null },
    ],
    version: (versionId: string) => versionId,
    termsAssignments: (termsId) => [assignment(termsId)],
  });

  expect(timeline.getVersions(date("2026-06-01"), date("2026-06-30"))).toEqual([
    {
      versionId: "england",
      version: "england",
      source: "from_their_terms",
      startDate: "2026-06-01",
      endDate: "2026-06-15",
    },
    {
      versionId: "scotland",
      version: "scotland",
      source: "from_their_terms",
      startDate: "2026-06-16",
      endDate: "2026-06-30",
    },
  ]);
});

it("merges neighbouring stretches with the same version and source", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [
      { termsId: "first", startDate: null, endDate: date("2026-06-15") },
      { termsId: "second", startDate: date("2026-06-16"), endDate: null },
    ],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("shared")],
  });

  expect(timeline.getVersions(date("2026-06-01"), date("2026-06-30"))).toEqual([
    {
      versionId: "shared",
      version: "shared",
      source: "from_their_terms",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    },
  ]);
});

it("keeps a source change visible even when the version stays the same", () => {
  const timeline = createPersonTimeline({
    direct: [assignment("shared", "2026-06-01", "2026-06-15")],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("shared")],
  });

  expect(timeline.getVersions(date("2026-06-01"), date("2026-06-30"))).toEqual([
    {
      versionId: "shared",
      version: "shared",
      source: "their_own",
      startDate: "2026-06-01",
      endDate: "2026-06-15",
    },
    {
      versionId: "shared",
      version: "shared",
      source: "from_their_terms",
      startDate: "2026-06-16",
      endDate: "2026-06-30",
    },
  ]);
});

it("leaves days without a version out of the stretches", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [
      assignment("previous", "2026-06-05", "2026-06-10"),
      assignment("next", "2026-06-20", "2026-06-25"),
    ],
  });

  expect(timeline.getVersions(date("2026-06-01"), date("2026-06-30"))).toEqual([
    {
      versionId: "previous",
      version: "previous",
      source: "from_their_terms",
      startDate: "2026-06-05",
      endDate: "2026-06-10",
    },
    {
      versionId: "next",
      version: "next",
      source: "from_their_terms",
      startDate: "2026-06-20",
      endDate: "2026-06-25",
    },
  ]);
});

it("resolves each time off type independently", () => {
  const terms = [{ termsId: "terms", startDate: null, endDate: null }];
  const annual = createPersonTimeline({
    direct: [assignment("own-annual")],
    terms,
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("terms-annual")],
  });
  const sickness = createPersonTimeline({
    direct: [],
    terms,
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("terms-sickness")],
  });

  expect(annual.getVersionOnDate(date("2026-06-01"))).toBe("own-annual");
  expect(sickness.getVersionOnDate(date("2026-06-01"))).toBe("terms-sickness");
});

it("reaches a person who joins the terms after the change date while employed", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [{ termsId: "terms", startDate: date("2026-12-01"), endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("standard")],
  });

  expect(
    timeline.appliesFrom((versionId) => versionId === "standard", date("2026-11-01"), [
      period("2026-01-01"),
    ]),
  ).toBe(true);
});

it("does not reach a person whose employment ended before the change date", () => {
  const timeline = createPersonTimeline({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("standard")],
  });

  expect(
    timeline.appliesFrom((versionId) => versionId === "standard", date("2026-11-01"), [
      period("2026-01-01", "2026-10-31"),
    ]),
  ).toBe(false);
});

it("does not reach a person whose own assignment covers every later day", () => {
  const timeline = createPersonTimeline({
    direct: [assignment("personal", "2026-11-01")],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    version: (versionId: string) => versionId,
    termsAssignments: () => [assignment("standard")],
  });

  expect(
    timeline.appliesFrom((versionId) => versionId === "standard", date("2026-11-01"), [
      period("2026-01-01"),
    ]),
  ).toBe(false);
});

function date(value: string): CalendarDate {
  return value as CalendarDate;
}
function period(startDate: string, endDate: string | null = null): CalendarDateRange {
  return { startDate: date(startDate), endDate: endDate === null ? null : date(endDate) };
}
function assignment(versionId: string, startDate = "2026-01-01", endDate: string | null = null) {
  return {
    versionId,
    startDate: date(startDate),
    endDate: endDate === null ? null : date(endDate),
  };
}
