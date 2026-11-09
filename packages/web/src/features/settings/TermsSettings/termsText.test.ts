import { expect, it } from "vitest";

import {
  annualLeaveSummary,
  deleteReason,
  plannedLine,
  ruleLine,
  splitVersions,
  takenNameError,
  versionBefore,
  weekSummary,
} from "./termsText";

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

it("has no current or planned version when there are no versions", () => {
  const result = splitVersions([], "2030-06-01");

  expect(result).toEqual({ current: null, planned: [] });
});

it("treats a first version with no start date as current", () => {
  const current = { id: "current", startDate: null };
  const planned = { id: "planned", startDate: "2030-07-01" };

  const result = splitVersions([current, planned], "2030-06-01");

  expect(result).toEqual({ current, planned: [planned] });
});

it("treats a version starting today as current and the rest as planned", () => {
  const current = { id: "current", startDate: "2030-06-01" };
  const planned = [
    { id: "next", startDate: "2030-07-01" },
    { id: "later", startDate: "2030-08-01" },
  ];

  const result = splitVersions([current, ...planned], "2030-06-01");

  expect(result).toEqual({ current, planned });
});

it("leaves out a version that ended before today", () => {
  const ended = { id: "ended", startDate: null, endDate: "2030-05-31" };
  const current = { id: "current", startDate: "2030-06-01", endDate: null };

  const result = splitVersions([ended, current], "2030-06-01");

  expect(result).toEqual({ current, planned: [] });
});

it("has no current version when every version starts after today", () => {
  const planned = [
    { id: "next", startDate: "2030-06-02" },
    { id: "later", startDate: "2030-07-01" },
  ];

  const result = splitVersions(planned, "2030-06-01");

  expect(result).toEqual({ current: null, planned });
});

it("explains why the default terms cannot be deleted", () => {
  expect(deleteReason("DEFAULT_TERMS", [])).toBe(
    "The default terms stay, because people without a location start on them.",
  );
});

it("explains why terms people were on cannot be deleted", () => {
  expect(deleteReason("TERMS_HAD_PEOPLE", [])).toBe(
    "Terms people were on stay, so their history stays true.",
  );
});

it("names the location that starts people on terms", () => {
  expect(deleteReason("LOCATION_STARTS_PEOPLE_ON_TERMS", ["Glasgow"])).toBe(
    "Glasgow starts new people here. Choose other terms for it in Settings › Locations first.",
  );
});

it("names both locations that start people on terms", () => {
  expect(deleteReason("LOCATION_STARTS_PEOPLE_ON_TERMS", ["Glasgow", "Leeds"])).toBe(
    "Glasgow and Leeds start new people here. Choose other terms for them in Settings › Locations first.",
  );
});

it("names the existing terms ignoring case and surrounding spaces", () => {
  expect(takenNameError(" scotland ", ["England and Wales", "Scotland"])).toBe(
    "There are already terms called Scotland.",
  );
});

it("explains a taken name when no matching terms are known", () => {
  expect(takenNameError("Scotland", ["England and Wales"])).toBe(
    "There are already terms with this name.",
  );
});

it("finds the earlier planned version that cancelling January would extend", () => {
  const first = { startDate: null, endDate: "2026-11-30" };
  const december = { startDate: "2026-12-01", endDate: "2026-12-31" };
  const january = { startDate: "2027-01-01", endDate: null };

  expect(versionBefore([first, december, january], "2027-01-01")).toBe(december);
});

it("finds the original version that cancelling December would extend", () => {
  const first = { startDate: null, endDate: "2026-11-30" };
  const december = { startDate: "2026-12-01", endDate: "2026-12-31" };
  const january = { startDate: "2027-01-01", endDate: null };

  expect(versionBefore([first, december, january], "2026-12-01")).toBe(first);
});

it("has no predecessor when cancelling the first offered version", () => {
  const first = { startDate: "2026-01-01", endDate: null };

  expect(versionBefore([first], "2026-01-01")).toBeNull();
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
