import { expect, it } from "vitest";

import { annualLeaveSummary, plannedLine, ruleLine, weekSummary } from "./termsText";

it("summarises consecutive working days with equal hours as a run", () => {
  expect(weekSummary(week)).toBe("Mon–Fri, 7.5 hours");
});

it("lists working days that are not a run", () => {
  expect(weekSummary({ ...week, tuesdayMinutes: 0, thursdayMinutes: 0 })).toBe(
    "Mon, Wed, Fri, 7.5 hours",
  );
});

it("summarises unequal hours with the weekly total", () => {
  expect(weekSummary({ ...week, mondayMinutes: 480, fridayMinutes: 420 })).toBe(
    "Mon–Fri, 37.5 hours a week",
  );
});

it("shows no working days for an empty week", () => {
  expect(
    weekSummary({
      mondayMinutes: 0,
      tuesdayMinutes: 0,
      wednesdayMinutes: 0,
      thursdayMinutes: 0,
      fridayMinutes: 0,
      saturdayMinutes: 0,
      sundayMinutes: 0,
    }),
  ).toBe("No working days");
});

it("drops the trailing decimal from whole hours", () => {
  expect(
    weekSummary({
      ...week,
      mondayMinutes: 480,
      tuesdayMinutes: 480,
      wednesdayMinutes: 480,
      thursdayMinutes: 480,
      fridayMinutes: 480,
    }),
  ).toBe("Mon–Fri, 8 hours");
});

it("summarises annual leave with bank holidays on top", () => {
  expect(annualLeaveSummary(policy)).toBe("20 days + bank holidays");
});

it("summarises annual leave with bank holidays included", () => {
  expect(
    annualLeaveSummary({
      ...policy,
      bankHolidays: "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE",
      yearlyEntitlement: { days: 28, daysPerWeek: 5 },
    }),
  ).toBe("28 days incl. bank holidays");
});

it("summarises unlimited annual leave", () => {
  expect(annualLeaveSummary(unlimited)).toBe("Unlimited");
});

it("summarises annual leave that does not count", () => {
  expect(annualLeaveSummary(recorded)).toBe("Doesn't count");
});

it("shows not offered when annual leave has no current version", () => {
  expect(annualLeaveSummary(null)).toBe("Not offered");
});

it("describes a balance with bank holidays on top and a fixed leave year", () => {
  expect(ruleLine(policy)).toBe(
    "From a balance · 20 days a year, bank holidays on top · Leave year from 1 January",
  );
});

it("describes a balance with bank holidays included", () => {
  expect(
    ruleLine({
      ...policy,
      bankHolidays: "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE",
      yearlyEntitlement: { days: 28, daysPerWeek: 5 },
    }),
  ).toBe("From a balance · 28 days a year, bank holidays included · Leave year from 1 January");
});

it("describes a leave year from the person's start date", () => {
  expect(
    ruleLine({
      ...policy,
      leaveYearStart: { kind: "LEAVE_YEAR_FROM_EMPLOYEE_START_DATE", month: null, day: null },
    }),
  ).toBe(
    "From a balance · 20 days a year, bank holidays on top · Leave year from each person's start date",
  );
});

it("describes unlimited leave with its leave year", () => {
  expect(ruleLine(unlimited)).toBe("Unlimited · Leave year from 1 January");
});

it("describes recorded leave that does not count", () => {
  expect(ruleLine(recorded)).toBe("Recorded, doesn't count");
});

it("describes a planned allowance with its start date", () => {
  expect(plannedLine({ ...policy, yearlyEntitlement: { days: 22, daysPerWeek: 5 } })).toBe(
    "From 1 Jan 2027: 22 days a year, bank holidays on top",
  );
});

it("describes a planned allowance with bank holidays included", () => {
  expect(plannedLine({ ...policy, bankHolidays: "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE" })).toBe(
    "From 1 Jan 2027: 20 days a year, bank holidays included",
  );
});

it("describes planned unlimited leave with its start date", () => {
  expect(plannedLine(unlimited)).toBe("From 1 Jan 2027: Unlimited");
});

it("describes planned recorded leave with its start date", () => {
  expect(plannedLine(recorded)).toBe("From 1 Jan 2027: recorded, doesn't count");
});

const week = {
  mondayMinutes: 450,
  tuesdayMinutes: 450,
  wednesdayMinutes: 450,
  thursdayMinutes: 450,
  fridayMinutes: 450,
  saturdayMinutes: 0,
  sundayMinutes: 0,
};

const policy: Parameters<typeof ruleLine>[0] = {
  startDate: "2027-01-01",
  balance: "BALANCE_FROM_ALLOWANCE",
  bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
  leaveYearStart: { kind: "LEAVE_YEAR_FROM_FIXED_DATE", month: 1, day: 1 },
  yearlyEntitlement: { days: 20, daysPerWeek: 5 },
};

const unlimited: Parameters<typeof ruleLine>[0] = {
  ...policy,
  balance: "UNLIMITED_BALANCE",
  bankHolidays: null,
  yearlyEntitlement: null,
};

const recorded: Parameters<typeof ruleLine>[0] = {
  ...policy,
  balance: "NO_BALANCE",
  bankHolidays: null,
  leaveYearStart: null,
  yearlyEntitlement: null,
};
