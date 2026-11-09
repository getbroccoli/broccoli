import { expect, it } from "vitest";

import { rowOf, ruleSourceLabel, termsPeriodsOn } from "./employmentTermsView";

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

it("keeps a version cached from yesterday as today's value", () => {
  const version = {
    source: "FROM_THEIR_TERMS" as const,
    startDate: "2026-11-09",
    endDate: null,
    text: "Mon–Fri, 7.5 hours",
  };

  const row = rowOf(
    [version],
    "2026-11-10",
    ({ text }) => ({ text }),
    () => "from England and Wales",
  );

  expect(row).toEqual({
    value: {
      text: "Mon–Fri, 7.5 hours",
      source: "FROM_THEIR_TERMS",
      sourceLabel: "from England and Wales",
    },
    planned: [],
  });
});

it("drops an ended version and shows the next version as today's value", () => {
  const versions = [
    {
      source: "FROM_THEIR_TERMS",
      startDate: "2026-11-09",
      endDate: "2026-11-30",
      text: "Mon–Fri, 7.5 hours",
    },
    {
      source: "FROM_THEIR_TERMS",
      startDate: "2026-12-01",
      endDate: null,
      text: "Mon–Thu, 8 hours",
    },
  ] as const;

  const row = rowOf(
    versions,
    "2026-12-02",
    ({ text }) => ({ text }),
    () => "from England and Wales",
  );

  expect(row).toEqual({
    value: {
      text: "Mon–Thu, 8 hours",
      source: "FROM_THEIR_TERMS",
      sourceLabel: "from England and Wales",
    },
    planned: [],
  });
});

it("shows a planned week's changed bank holiday calendar when the hours stay the same", () => {
  const versions = [
    {
      source: "FROM_THEIR_TERMS",
      startDate: "2026-11-09",
      endDate: "2026-11-30",
      text: "Mon–Fri, 7.5 hours",
      detail: "England and Wales bank holidays",
    },
    {
      source: "FROM_THEIR_TERMS",
      startDate: "2026-12-01",
      endDate: null,
      text: "Mon–Fri, 7.5 hours",
      detail: "Scotland bank holidays",
    },
  ] as const;

  const row = rowOf(
    versions,
    "2026-11-09",
    ({ text, detail }) => ({ text, detail }),
    () => "from England and Wales",
  );

  expect(row.planned).toEqual(["From 1 Dec 2026: Mon–Fri, 7.5 hours · Scotland bank holidays"]);
});

it("names the terms when a planned change returns from the person's own week", () => {
  const versions = [
    {
      source: "THEIR_OWN",
      startDate: "2026-11-09",
      endDate: "2026-12-31",
      text: "Mon–Thu, 8 hours",
    },
    {
      source: "FROM_THEIR_TERMS",
      startDate: "2027-01-01",
      endDate: null,
      text: "Mon–Fri, 7.5 hours",
    },
  ] as const;

  const row = rowOf(
    versions,
    "2026-11-09",
    ({ text }) => ({ text }),
    ({ source }) => (source === "THEIR_OWN" ? "Sam’s own" : "from England and Wales"),
  );

  expect(row.planned).toEqual(["From 1 Jan 2027: Mon–Fri, 7.5 hours · from England and Wales"]);
});
