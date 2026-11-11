import { expect, it } from "vitest";

import {
  ownRulesSavedToast,
  ownRulesSaveLine,
  termsRulesSavedToast,
  termsRulesSaveLine,
} from "./ownRulesText";

it("explains giving a person their own rules from a future date", () => {
  expect(
    ownRulesSaveLine({
      firstName: "Sam",
      typeName: "Annual leave",
      startDate: "2027-01-01",
      today: "2026-11-09",
      alreadyOwn: false,
      offer: false,
    }),
  ).toBe("Saving gives Sam their own Annual leave rules from 1 Jan 2027.");
});

it("explains changing a person's own rules from a future date", () => {
  expect(
    ownRulesSaveLine({
      firstName: "Sam",
      typeName: "Annual leave",
      startDate: "2027-01-01",
      today: "2026-11-09",
      alreadyOwn: true,
      offer: false,
    }),
  ).toBe("Saving changes Sam’s own Annual leave rules from 1 Jan 2027.");
});

it("explains offering a type the person's terms do not offer", () => {
  expect(
    ownRulesSaveLine({
      firstName: "Sam",
      typeName: "Family leave",
      startDate: "2026-01-01",
      today: "2026-11-09",
      alreadyOwn: false,
      offer: true,
    }),
  ).toBe(
    "Saving offers Family leave to Sam from 1 Jan 2026. Sam’s allowance is worked out again from that date.",
  );
});

it.each([
  { when: "today", startDate: "2026-11-09", date: "9 Nov 2026" },
  { when: "in the past", startDate: "2026-03-01", date: "1 Mar 2026" },
])(
  "explains the allowance is worked out again when own rules start $when",
  ({ startDate, date }) => {
    expect(
      ownRulesSaveLine({
        firstName: "Sam",
        typeName: "Annual leave",
        startDate,
        today: "2026-11-09",
        alreadyOwn: false,
        offer: false,
      }),
    ).toBe(
      `Saving gives Sam their own Annual leave rules from ${date}. Sam’s allowance is worked out again from that date.`,
    );
  },
);

it("explains returning to the terms' rules from a future date", () => {
  expect(
    termsRulesSaveLine({
      firstName: "Sam",
      typeName: "Annual leave",
      termsName: "England and Wales",
      termsOffer: true,
      startDate: "2027-01-01",
      today: "2026-11-09",
    }),
  ).toBe("Saving puts Sam back on England and Wales’s Annual leave rules from 1 Jan 2027.");
});

it("explains taking away a type the terms do not offer", () => {
  expect(
    termsRulesSaveLine({
      firstName: "Sam",
      typeName: "Family leave",
      termsName: "England and Wales",
      termsOffer: false,
      startDate: "2027-01-01",
      today: "2026-11-09",
    }),
  ).toBe(
    "Saving takes Family leave away from Sam from 1 Jan 2027, as England and Wales doesn’t offer it.",
  );
});

it.each([
  { when: "today", startDate: "2026-11-09", date: "9 Nov 2026" },
  { when: "in the past", startDate: "2026-03-01", date: "1 Mar 2026" },
])(
  "explains the allowance is worked out again when the terms' rules resume $when",
  ({ startDate, date }) => {
    expect(
      termsRulesSaveLine({
        firstName: "Sam",
        typeName: "Annual leave",
        termsName: "England and Wales",
        termsOffer: true,
        startDate,
        today: "2026-11-09",
      }),
    ).toBe(
      `Saving puts Sam back on England and Wales’s Annual leave rules from ${date}. Sam’s allowance is worked out again from that date.`,
    );
  },
);

it("names the person and type whose own rules were saved", () => {
  expect(ownRulesSavedToast("Sam", "Annual leave")).toBe("Sam’s own Annual leave saved.");
});

it("names the person, terms, type and date after returning to the terms' rules", () => {
  expect(
    termsRulesSavedToast({
      firstName: "Sam",
      typeName: "Annual leave",
      termsName: "England and Wales",
      termsOffer: true,
      startDate: "2027-01-01",
    }),
  ).toBe("Sam is back on England and Wales’s Annual leave from 1 Jan 2027.");
});

it("says the type is no longer offered after returning to terms that do not offer it", () => {
  expect(
    termsRulesSavedToast({
      firstName: "Sam",
      typeName: "Family leave",
      termsName: "England and Wales",
      termsOffer: false,
      startDate: "2027-01-01",
    }),
  ).toBe("Family leave is no longer offered to Sam from 1 Jan 2027.");
});
