import { expect, it } from "vitest";

import {
  allowanceInputs,
  balanceOf,
  calendarDate,
  onTopPolicy,
  calculatedRowsOf,
} from "#test/support";

import { calculateAllowance } from "./allowanceCalculator";

it("grants 28 days and takes eight bank holidays for a full-time leave year", () => {
  const lines = calculateAllowance(allowanceInputs());

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "28"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-31", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0"],
  ]);
  expect(balanceOf(lines)).toEqual("20");
  expect(lines.every((line) => line.firstDate === "2026-01-01")).toEqual(true);
});

it("prorates from 12 October and takes only bank holidays after joining", () => {
  const inputs = allowanceInputs();
  inputs.employments = [{ startDate: calendarDate("2026-10-12"), endDate: null }];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "6.213699"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0.286301"],
  ]);
  expect(balanceOf(lines)).toEqual("4.5");
  expect(lines.every((line) => line.firstDate === "2026-10-12")).toEqual(true);
});

it("combines the year's full-time and three-day weeks before rounding once", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [
    ...inputs.workingWeeks,
    {
      ...inputs.workingWeeks[0]!,
      effectiveFrom: calendarDate("2026-09-01"),
      minutes: [0, 450, 450, 450, 0, 0, 0],
    },
  ];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "24.256438"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-31", "-1"],
    ["bank_holiday_taken", "2026-12-25", "0"],
    ["bank_holiday_taken", "2026-12-28", "0"],
    ["rounding_up_to_half_day", null, "0.243562"],
  ]);
  expect(balanceOf(lines)).toEqual("18.5");
});

it("caps a six-day worker's statutory entitlement at 28 days", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [
    { ...inputs.workingWeeks[0]!, minutes: [450, 450, 450, 450, 450, 450, 0] },
  ];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "28"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-31", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0"],
  ]);
  expect(balanceOf(lines)).toEqual("20");
});

it("prorates through the inclusive employment end and takes no later bank holidays", () => {
  const inputs = allowanceInputs();
  inputs.employments = [{ startDate: null, endDate: calendarDate("2026-06-30") }];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "13.884932"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["rounding_up_to_half_day", null, "0.115068"],
  ]);
  expect(balanceOf(lines)).toEqual("9");
});

it("grants and takes nothing during a gap without a working week", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [
    ...inputs.workingWeeks,
    {
      effectiveFrom: calendarDate("2026-07-01"),
      minutes: null,
      fullDayMinutes: null,
      bankHolidayCalendar: null,
    },
    { ...inputs.workingWeeks[0]!, effectiveFrom: calendarDate("2026-10-01") },
  ];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "20.942466"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0.057534"],
  ]);
  expect(balanceOf(lines)).toEqual("14");
});

it("grants a service extra from its anniversary and omits an unreached step", () => {
  const inputs = allowanceInputs();
  const policy = onTopPolicy();
  inputs.serviceStart = calendarDate("2024-07-01");
  inputs.policies = [
    {
      ...policy,
      rules: [
        ...policy.rules,
        { id: "two-years", kind: "service_extra", afterYears: 2, extraDays: 1 },
        { id: "five-years", kind: "service_extra", afterYears: 5, extraDays: 3 },
      ],
    },
  ];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "25"],
    ["entitlement_grant", "two-years", "0.50411"],
    ["bank_holiday_allowance_grant", null, "8"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-31", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0.49589"],
  ]);
  expect(balanceOf(lines)).toEqual("26");
  expect(lines.find((line) => line.allowanceRuleId === "two-years")?.firstDate).toEqual(
    "2026-07-01",
  );
});

it("returns no lines for a policy without a balance", () => {
  const inputs = allowanceInputs();
  inputs.policies = [
    {
      ...inputs.policies[0]!,
      balance: "no_balance",
      bankHolidays: null,
      rules: [],
    },
  ];

  expect(calculateAllowance(inputs)).toEqual([]);
});

it("keeps 28 days across three equivalent policies without adding half a day", () => {
  const inputs = allowanceInputs();
  const policy = inputs.policies[0]!;
  const yearly = policy.rules[0]!;
  inputs.policies = [
    {
      ...policy,
      effectiveUntil: calendarDate("2026-03-31"),
      rules: [{ ...yearly, id: "first-yearly" }],
    },
    {
      ...policy,
      effectiveFrom: calendarDate("2026-04-01"),
      effectiveUntil: calendarDate("2026-06-29"),
      rules: [{ ...yearly, id: "second-yearly" }],
    },
    {
      ...policy,
      effectiveFrom: calendarDate("2026-06-30"),
      rules: [{ ...yearly, id: "third-yearly" }],
    },
  ];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "first-yearly", "6.90411"],
    ["entitlement_grant", "second-yearly", "6.90411"],
    ["entitlement_grant", "third-yearly", "14.191781"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-31", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "-0.000001"],
  ]);
  expect(balanceOf(lines)).toEqual("20");
});

it("returns a service extra before yearly entitlement when the policy lists it first", () => {
  const inputs = allowanceInputs();
  const policy = inputs.policies[0]!;
  inputs.serviceStart = calendarDate("2020-01-01");
  inputs.policies = [
    {
      ...policy,
      rules: [
        { id: "two-years", kind: "service_extra", afterYears: 2, extraDays: 1 },
        ...policy.rules,
      ],
    },
  ];

  const lines = calculateAllowance(inputs);

  expect(calculatedRowsOf(lines)).toEqual([
    ["entitlement_grant", "two-years", "1"],
    ["entitlement_grant", "yearly", "28"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-31", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0"],
  ]);
  expect(balanceOf(lines)).toEqual("21");
});
