import { expect, it } from "vitest";

import {
  cancellableStarts,
  ownWeekSavedToast,
  ownWeekSaveLine,
  termsWeekSavedToast,
  termsWeekSaveLine,
  versionToEditFrom,
} from "./ownWeekText";

it("explains giving a person their own week from a future date", () => {
  expect(
    ownWeekSaveLine({
      firstName: "Sam",
      startDate: "2026-12-01",
      today: "2026-11-09",
      alreadyOwn: false,
    }),
  ).toBe("Saving gives Sam their own working week from 1 Dec 2026.");
});

it("explains changing a person's own week from a future date", () => {
  expect(
    ownWeekSaveLine({
      firstName: "Sam",
      startDate: "2026-12-01",
      today: "2026-11-09",
      alreadyOwn: true,
    }),
  ).toBe("Saving changes Sam’s own working week from 1 Dec 2026.");
});

it.each([
  { when: "today", startDate: "2026-11-09", date: "9 Nov 2026" },
  { when: "in the past", startDate: "2026-03-01", date: "1 Mar 2026" },
])(
  "explains the allowance is worked out again when an own week starts $when",
  ({ startDate, date }) => {
    expect(
      ownWeekSaveLine({ firstName: "Sam", startDate, today: "2026-11-09", alreadyOwn: false }),
    ).toBe(
      `Saving gives Sam their own working week from ${date}. Sam’s allowance is worked out again from that date.`,
    );
  },
);

it("explains returning to the terms' week from a future date", () => {
  expect(
    termsWeekSaveLine({
      firstName: "Sam",
      termsName: "England and Wales",
      startDate: "2027-01-04",
      today: "2026-11-09",
    }),
  ).toBe("Saving puts Sam back on England and Wales’s working week from 4 Jan 2027.");
});

it.each([
  { when: "today", startDate: "2026-11-09", date: "9 Nov 2026" },
  { when: "in the past", startDate: "2026-03-01", date: "1 Mar 2026" },
])(
  "explains the allowance is worked out again when the terms' week resumes $when",
  ({ startDate, date }) => {
    expect(
      termsWeekSaveLine({
        firstName: "Sam",
        termsName: "England and Wales",
        startDate,
        today: "2026-11-09",
      }),
    ).toBe(
      `Saving puts Sam back on England and Wales’s working week from ${date}. Sam’s allowance is worked out again from that date.`,
    );
  },
);

it("names the person whose own week was saved", () => {
  expect(ownWeekSavedToast("Sam")).toBe("Sam’s own working week saved.");
});

it("names the person, terms and date after returning to the terms' week", () => {
  expect(
    termsWeekSavedToast({
      firstName: "Sam",
      termsName: "England and Wales",
      startDate: "2027-01-04",
    }),
  ).toBe("Sam is back on England and Wales’s week from 4 Jan 2027.");
});

it("allows cancelling a planned own week", () => {
  expect(
    cancellableStarts(
      [
        { source: "FROM_THEIR_TERMS", startDate: "2026-11-09", endDate: "2026-11-30" },
        { source: "THEIR_OWN", startDate: "2026-12-01", endDate: null },
      ],
      "2026-11-09",
    ),
  ).toEqual(["2026-12-01"]);
});

it("allows cancelling a planned return after an own week", () => {
  expect(
    cancellableStarts(
      [
        { source: "THEIR_OWN", startDate: "2026-11-09", endDate: "2026-12-31" },
        { source: "FROM_THEIR_TERMS", startDate: "2027-01-01", endDate: null },
      ],
      "2026-11-09",
    ),
  ).toEqual(["2027-01-01"]);
});

it("does not offer cancellation for a planned change from the terms", () => {
  expect(
    cancellableStarts(
      [
        { source: "FROM_THEIR_TERMS", startDate: "2026-11-09", endDate: "2026-11-30" },
        { source: "FROM_THEIR_TERMS", startDate: "2026-12-01", endDate: null },
      ],
      "2026-11-09",
    ),
  ).toEqual([]);
});

it("allows cancelling a planned return when the terms do not offer the type", () => {
  expect(
    cancellableStarts(
      [
        { source: "FROM_THEIR_TERMS", startDate: "2026-11-09", endDate: "2026-12-31" },
        { source: "THEIR_OWN", startDate: "2027-01-01", endDate: "2027-06-30" },
      ],
      "2026-11-09",
    ),
  ).toEqual(["2027-01-01", "2027-07-01"]);
});

it("allows cancelling the return but not a later terms offer after a gap", () => {
  expect(
    cancellableStarts(
      [
        { source: "THEIR_OWN", startDate: "2026-01-01", endDate: "2026-12-31" },
        { source: "FROM_THEIR_TERMS", startDate: "2027-03-01", endDate: null },
      ],
      "2026-11-09",
    ),
  ).toEqual(["2027-01-01"]);
});

it("edits a person who has not started yet from their first week", () => {
  const first = { source: "FROM_THEIR_TERMS" as const, startDate: "2027-01-04", endDate: null };
  expect(versionToEditFrom([first], "2026-11-09")).toBe(first);
});
