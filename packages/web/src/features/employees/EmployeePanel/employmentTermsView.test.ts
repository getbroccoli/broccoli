import { expect, it } from "vitest";

import { ruleSourceLabel, termsPeriodsOn } from "./employmentTermsView";

it("keeps today's terms current and puts planned moves in date order", () => {
  const current = {
    termsId: "england",
    termsName: "England and Wales",
    startDate: null,
    endDate: "2026-08-31",
  };
  const september = {
    termsId: "scotland",
    termsName: "Scotland",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
  };
  const january = {
    termsId: "northern-ireland",
    termsName: "Northern Ireland",
    startDate: "2027-01-01",
    endDate: null,
  };

  const result = termsPeriodsOn([january, current, september], "2026-06-01");

  expect(result).toEqual({ current, planned: [september, january], earlier: [] });
});

it("lists earlier terms newest first beside the terms starting today", () => {
  const oldest = {
    termsId: "england",
    termsName: "England and Wales",
    startDate: null,
    endDate: "2025-12-31",
  };
  const previous = {
    termsId: "scotland",
    termsName: "Scotland",
    startDate: "2026-01-01",
    endDate: "2026-05-31",
  };
  const current = {
    termsId: "northern-ireland",
    termsName: "Northern Ireland",
    startDate: "2026-06-01",
    endDate: null,
  };

  const result = termsPeriodsOn([oldest, current, previous], "2026-06-01");

  expect(result).toEqual({ current, planned: [], earlier: [previous, oldest] });
});

it("has no current terms before the person's first period starts", () => {
  const future = {
    termsId: "england",
    termsName: "England and Wales",
    startDate: "2026-09-01",
    endDate: null,
  };

  const result = termsPeriodsOn([future], "2026-06-01");

  expect(result).toEqual({ current: null, planned: [future], earlier: [] });
});

it.each([
  { source: "FROM_THEIR_TERMS", viewerIsPerson: false, expected: "from England and Wales" },
  { source: "THEIR_OWN", viewerIsPerson: false, expected: "Sam’s own" },
  { source: "FROM_THEIR_TERMS", viewerIsPerson: true, expected: "from your terms" },
  { source: "THEIR_OWN", viewerIsPerson: true, expected: "Your own" },
] as const)(
  "labels $source as '$expected' for viewerIsPerson=$viewerIsPerson",
  ({ source, viewerIsPerson, expected }) => {
    const label = ruleSourceLabel(source, {
      termsName: "England and Wales",
      viewerIsPerson,
      personFirstName: "Sam",
    });

    expect(label).toBe(expected);
  },
);
