import { expect, it } from "vitest";

import type { CalendarDate, CalendarDateRange } from "../../../utils";
import { createPersonTimeline } from "./personTimeline";

it("uses a direct row over the terms on a date it covers", () => {
  const personal = { startDate: null, endDate: null, days: 25 };
  const standard = { startDate: null, endDate: null, days: 20 };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [
      {
        id: "personal",
        startDate: "2026-06-01" as CalendarDate,
        endDate: "2026-06-30" as CalendarDate,
      },
    ],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "personal" ? [personal] : id === "standard" ? [standard] : []),
  });

  const version = timeline.getVersionOnDate("2026-06-15" as CalendarDate);

  expect(version).toBe(personal);
});

it("uses the terms' version without a direct row", () => {
  const standard = { startDate: null, endDate: null, days: 20 };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [],
    terms: [{ termsId: "terms", startDate: "2026-01-01" as CalendarDate, endDate: null }],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "standard" ? [standard] : []),
  });

  const version = timeline.getVersionOnDate("2026-06-15" as CalendarDate);

  expect(version).toBe(standard);
});

it("returns null after the terms' policy ends", () => {
  const standard = { startDate: null, endDate: "2026-12-31" as CalendarDate, days: 20 };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "standard" ? [standard] : []),
  });

  const version = timeline.getVersionOnDate("2027-01-01" as CalendarDate);

  expect(version).toBeNull();
});

it("returns null for a person with no terms or direct row", () => {
  const standard = { startDate: null, endDate: null, days: 20 };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [],
    terms: [],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "standard" ? [standard] : []),
  });

  const version = timeline.getVersionOnDate("2026-06-15" as CalendarDate);

  expect(version).toBeNull();
});

it("splits stretches where one version ends and the next starts", () => {
  const previous = { startDate: null, endDate: "2026-12-31" as CalendarDate, days: 20 };
  const next = { startDate: "2027-01-01" as CalendarDate, endDate: null, days: 22 };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "standard" ? [previous, next] : []),
  });

  const stretches = timeline.getVersions(
    "2026-12-01" as CalendarDate,
    "2027-01-31" as CalendarDate,
  );

  expect(stretches).toEqual([
    { version: previous, startDate: "2026-12-01", endDate: "2026-12-31" },
    { version: next, startDate: "2027-01-01", endDate: "2027-01-31" },
  ]);
});

it("returns to the terms' version after a direct row ends", () => {
  const personal = { startDate: null, endDate: null, days: 25 };
  const standard = { startDate: null, endDate: null, days: 20 };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [
      {
        id: "personal",
        startDate: "2026-06-10" as CalendarDate,
        endDate: "2026-06-20" as CalendarDate,
      },
    ],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "personal" ? [personal] : id === "standard" ? [standard] : []),
  });

  const stretches = timeline.getVersions(
    "2026-06-01" as CalendarDate,
    "2026-06-30" as CalendarDate,
  );

  expect(stretches).toEqual([
    { version: standard, startDate: "2026-06-01", endDate: "2026-06-09" },
    { version: personal, startDate: "2026-06-10", endDate: "2026-06-20" },
    { version: standard, startDate: "2026-06-21", endDate: "2026-06-30" },
  ]);
});

it("merges consecutive rows of the same terms into one stretch", () => {
  const standard = { startDate: null, endDate: null, days: 20 };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [],
    terms: [
      { termsId: "terms", startDate: null, endDate: "2026-06-15" as CalendarDate },
      { termsId: "terms", startDate: "2026-06-16" as CalendarDate, endDate: null },
    ],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "standard" ? [standard] : []),
  });

  const stretches = timeline.getVersions(
    "2026-06-01" as CalendarDate,
    "2026-06-30" as CalendarDate,
  );

  expect(stretches).toEqual([
    { version: standard, startDate: "2026-06-01", endDate: "2026-06-30" },
  ]);
});

it("leaves days without a version out of the stretches", () => {
  const previous = {
    startDate: "2026-06-05" as CalendarDate,
    endDate: "2026-06-10" as CalendarDate,
    days: 20,
  };
  const next = {
    startDate: "2026-06-20" as CalendarDate,
    endDate: "2026-06-25" as CalendarDate,
    days: 22,
  };
  const timeline = createPersonTimeline<CalendarDateRange & { days: number }>({
    direct: [],
    terms: [{ termsId: "terms", startDate: null, endDate: null }],
    idOfTerms: (termsId) => (termsId === "terms" ? "standard" : null),
    versions: (id) => (id === "standard" ? [previous, next] : []),
  });

  const stretches = timeline.getVersions(
    "2026-06-01" as CalendarDate,
    "2026-06-30" as CalendarDate,
  );

  expect(stretches).toEqual([
    { version: previous, startDate: "2026-06-05", endDate: "2026-06-10" },
    { version: next, startDate: "2026-06-20", endDate: "2026-06-25" },
  ]);
});
