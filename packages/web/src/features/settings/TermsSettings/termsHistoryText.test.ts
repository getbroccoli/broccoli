import { expect, it } from "vitest";

import { termsChangeSentence } from "./termsHistoryText";

it("names the one day whose hours changed", () => {
  expect(weekSentence({ ...week, minutes: [450, 450, 450, 480, 450, 0, 0] }, TODAY)).toBe(
    "changed Thu to 8 hours",
  );
});

it("names several days that changed to the same hours", () => {
  expect(weekSentence({ ...week, minutes: [450, 450, 450, 480, 480, 0, 0] }, TODAY)).toBe(
    "changed Thu and Fri to 8 hours",
  );
});

it("names a day that became a day off", () => {
  expect(weekSentence({ ...week, minutes: [450, 450, 450, 450, 0, 0, 0] }, TODAY)).toBe(
    "made Fri a day off",
  );
});

it("names only the bank holidays when nothing else changed", () => {
  expect(weekSentence({ ...week, bankHolidayCalendar: "scotland" }, TODAY)).toBe(
    "changed bank holidays to Scotland",
  );
});

it("gives the whole week when days change to different hours", () => {
  expect(weekSentence({ ...week, minutes: [480, 480, 480, 480, 240, 0, 0] }, TODAY)).toBe(
    "changed the working week to Mon–Fri, 36 hours a week",
  );
});

it("adds the date of a week planned ahead", () => {
  expect(
    weekSentence(
      { ...week, startDate: "2026-12-01", minutes: [450, 450, 450, 480, 450, 0, 0] },
      TODAY,
    ),
  ).toBe("changed Thu to 8 hours from 1 Dec 2026");
});

it("describes a cancelled working week using the cancelled start date", () => {
  expect(
    termsChangeSentence(
      {
        field: "workingWeek",
        oldValue: JSON.stringify({ ...week, startDate: "2026-12-01" }),
        newValue: null,
      },
      TODAY,
    ),
  ).toBe("cancelled the change to the working week from 1 Dec 2026");
});

it("names only the days when an allowance changes", () => {
  expect(rulesSentence(rules, "2027-01-01")).toBe(
    "changed Annual leave to 22 days a year from 1 Jan 2027",
  );
});

it("gives the whole rule when how the type counts changes", () => {
  expect(
    rulesSentence(
      {
        ...rules,
        startDate: TODAY,
        balance: "no_balance",
        entitlementDays: null,
        bankHolidays: null,
      },
      TODAY,
    ),
  ).toBe("changed Annual leave to recorded, doesn't count");
});

it("describes an offer from today without its date", () => {
  expect(
    termsChangeSentence(
      {
        field: "timeOff.family",
        newLabel: "Family leave",
        oldValue: null,
        newValue: JSON.stringify({ ...noBalance, startDate: TODAY }),
      },
      TODAY,
    ),
  ).toBe("offered Family leave: Recorded, doesn't count");
});

it("describes an offer from another day with its date", () => {
  expect(
    termsChangeSentence(
      {
        field: "timeOff.family",
        newLabel: "Family leave",
        oldValue: null,
        newValue: JSON.stringify({ ...noBalance, startDate: "2027-01-01" }),
      },
      TODAY,
    ),
  ).toBe("offered Family leave from 1 Jan 2027: Recorded, doesn't count");
});

it("describes cancelled rules with the type's name and cancelled start date", () => {
  expect(
    termsChangeSentence(
      {
        field: "timeOff.annual",
        newLabel: "Annual leave",
        oldValue: JSON.stringify({ ...rules, startDate: "2027-01-01" }),
        newValue: null,
      },
      TODAY,
    ),
  ).toBe("cancelled the change to Annual leave from 1 Jan 2027");
});

it("leaves other fields to the generic history wording", () => {
  expect(
    termsChangeSentence({ field: "name", oldValue: "Old terms", newValue: "New terms" }, TODAY),
  ).toBeNull();
});

const TODAY = "2026-11-08";

const week = {
  startDate: TODAY,
  minutes: [450, 450, 450, 450, 450, 0, 0],
  bankHolidayCalendar: "england_and_wales",
};

const rules = {
  startDate: TODAY,
  balance: "balance_from_allowance",
  entitlementDays: 22,
  bankHolidays: "bank_holidays_on_top_of_allowance",
};

const noBalance = { balance: "no_balance", entitlementDays: null, bankHolidays: null };

/** The sentence for changing `week` above to `next`. */
function weekSentence(next: typeof week, madeOn: string) {
  return termsChangeSentence(
    {
      field: "workingWeek",
      oldValue: JSON.stringify({ ...week, startDate: null }),
      newValue: JSON.stringify(next),
    },
    madeOn,
  );
}

/** The sentence for changing Annual leave from 20 days to `next`, starting on `startDate`. */
function rulesSentence(next: Record<string, unknown>, startDate: string) {
  return termsChangeSentence(
    {
      field: "timeOff.annual",
      newLabel: "Annual leave",
      oldValue: JSON.stringify({ ...rules, startDate: null, entitlementDays: 20 }),
      newValue: JSON.stringify({ ...next, startDate }),
    },
    TODAY,
  );
}
