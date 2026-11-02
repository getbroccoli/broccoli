import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import { allowanceTargetOf, type AllowanceTargetInputs, type DatedPolicy } from "./allowanceTarget";

it("grants 28 days and takes eight bank holidays for a full-time leave year", () => {
  const inputs = allowanceInputs();
  const lines = allowanceTargetOf(inputs);

  expect(lines.map((line) => [line.kind, line.amount])).toEqual([
    ["entitlement_grant", 28],
    ...inputs.bankHolidays.get("england_and_wales")!.map(() => ["bank_holiday_taken", -1]),
    ["rounding_up_to_half_day", 0],
  ]);
  expect(
    lines.filter((line) => line.kind === "bank_holiday_taken").map((line) => line.bankHolidayDate),
  ).toEqual(inputs.bankHolidays.get("england_and_wales"));
  expect(lines.every((line) => line.firstDate === "2026-01-01")).toEqual(true);
});

it("prorates from 12 October and takes only bank holidays after joining", () => {
  const inputs = allowanceInputs();
  inputs.employments = [{ startDate: "2026-10-12" as CalendarDate, endDate: null }];

  const lines = allowanceTargetOf(inputs);

  expect(lines.map((line) => [line.kind, line.amount])).toEqual([
    ["entitlement_grant", 6.213699],
    ["bank_holiday_taken", -1],
    ["bank_holiday_taken", -1],
    ["rounding_up_to_half_day", 0.286301],
  ]);
  expect(
    lines.filter((line) => line.kind === "bank_holiday_taken").map((line) => line.bankHolidayDate),
  ).toEqual(["2026-12-25", "2026-12-28"]);
  expect(lines.every((line) => line.firstDate === "2026-10-12")).toEqual(true);
});

it("grants eight bank holidays on top of 25 days and still takes each holiday", () => {
  const inputs = allowanceInputs();
  inputs.policies = [onTopPolicy()];

  const lines = allowanceTargetOf(inputs);

  expect(lines.find((line) => line.kind === "entitlement_grant")?.amount).toEqual(25);
  expect(lines.find((line) => line.kind === "bank_holiday_allowance_grant")).toMatchObject({
    amount: 8,
    firstDate: "2026-01-01",
  });
  expect(
    lines.filter((line) => line.kind === "bank_holiday_taken").map((line) => line.amount),
  ).toEqual([-1, -1, -1, -1, -1, -1, -1, -1]);
  expect(lines.find((line) => line.kind === "rounding_up_to_half_day")?.amount).toEqual(0);
});

it("combines the year's full-time and three-day weeks before rounding once", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [
    ...inputs.workingWeeks,
    {
      ...inputs.workingWeeks[0]!,
      effectiveFrom: "2026-09-01" as CalendarDate,
      minutes: [0, 450, 450, 450, 0, 0, 0],
    },
  ];

  const lines = allowanceTargetOf(inputs);

  expect(
    lines.filter((line) => line.kind === "entitlement_grant").map((line) => line.amount),
  ).toEqual([24.256438]);
  expect(
    lines.filter((line) => line.bankHolidayDate?.startsWith("2026-12")).map((line) => line.amount),
  ).toEqual([0, 0]);
  expect(lines.find((line) => line.kind === "rounding_up_to_half_day")?.amount).toEqual(0.243562);
});

it("caps a six-day worker's statutory entitlement at 28 days", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [
    { ...inputs.workingWeeks[0]!, minutes: [450, 450, 450, 450, 450, 450, 0] },
  ];

  const lines = allowanceTargetOf(inputs);

  expect(lines.find((line) => line.kind === "entitlement_grant")?.amount).toEqual(28);
});

it("counts a half-length Friday as half a day for entitlement and Good Friday", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [{ ...inputs.workingWeeks[0]!, minutes: [450, 450, 450, 450, 225, 0, 0] }];

  const lines = allowanceTargetOf(inputs);

  expect(lines.find((line) => line.kind === "entitlement_grant")?.amount).toEqual(25.2);
  expect(lines.find((line) => line.bankHolidayDate === "2026-04-03")?.amount).toEqual(-0.5);
  expect(lines.find((line) => line.kind === "rounding_up_to_half_day")?.amount).toEqual(0.3);
});

it("takes the working week's Scottish bank holidays", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [{ ...inputs.workingWeeks[0]!, bankHolidayCalendar: "scotland" }];

  const lines = allowanceTargetOf(inputs);

  expect(
    lines
      .filter((line) => line.kind === "bank_holiday_taken")
      .map((line) => [line.bankHolidayDate, line.amount]),
  ).toEqual([
    ["2026-01-01", -1],
    ["2026-01-02", -1],
    ["2026-04-03", -1],
    ["2026-05-04", -1],
    ["2026-05-25", -1],
    ["2026-08-03", -1],
    ["2026-11-30", -1],
    ["2026-12-25", -1],
    ["2026-12-28", -1],
  ]);
});

it("prorates through the inclusive employment end and takes no later bank holidays", () => {
  const inputs = allowanceInputs();
  inputs.employments = [{ startDate: null, endDate: "2026-06-30" as CalendarDate }];

  const lines = allowanceTargetOf(inputs);

  expect(lines.find((line) => line.kind === "entitlement_grant")?.amount).toEqual(13.884932);
  expect(
    lines.filter((line) => line.kind === "bank_holiday_taken").map((line) => line.bankHolidayDate),
  ).toEqual(["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25"]);
});

it("grants and takes nothing during a gap without a working week", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [
    ...inputs.workingWeeks,
    {
      effectiveFrom: "2026-07-01" as CalendarDate,
      minutes: null,
      fullDayMinutes: null,
      bankHolidayCalendar: null,
    },
    { ...inputs.workingWeeks[0]!, effectiveFrom: "2026-10-01" as CalendarDate },
  ];

  const lines = allowanceTargetOf(inputs);

  expect(lines.find((line) => line.kind === "entitlement_grant")?.amount).toEqual(20.942466);
  expect(
    lines.filter((line) => line.kind === "bank_holiday_taken").map((line) => line.bankHolidayDate),
  ).toEqual([
    "2026-01-01",
    "2026-04-03",
    "2026-04-06",
    "2026-05-04",
    "2026-05-25",
    "2026-12-25",
    "2026-12-28",
  ]);
});

it("grants a service extra from its anniversary and omits an unreached step", () => {
  const inputs = allowanceInputs();
  const policy = onTopPolicy();
  inputs.serviceStart = "2024-07-01" as CalendarDate;
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

  const lines = allowanceTargetOf(inputs);

  expect(
    lines
      .filter((line) => line.kind === "entitlement_grant")
      .map((line) => [line.allowanceRuleId, line.amount, line.firstDate]),
  ).toEqual([
    ["yearly", 25, "2026-01-01"],
    ["two-years", 0.50411, "2026-07-01"],
  ]);
  expect(lines.find((line) => line.kind === "bank_holiday_allowance_grant")?.amount).toEqual(8);
  expect(lines.find((line) => line.kind === "rounding_up_to_half_day")?.amount).toEqual(0.49589);
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

  expect(allowanceTargetOf(inputs)).toEqual([]);
});

it("keeps 28 days across three equivalent policies without adding half a day", () => {
  const inputs = allowanceInputs();
  const policy = inputs.policies[0]!;
  const yearly = policy.rules[0]!;
  inputs.policies = [
    {
      ...policy,
      effectiveUntil: "2026-03-31" as CalendarDate,
      rules: [{ ...yearly, id: "first-yearly" }],
    },
    {
      ...policy,
      effectiveFrom: "2026-04-01" as CalendarDate,
      effectiveUntil: "2026-06-29" as CalendarDate,
      rules: [{ ...yearly, id: "second-yearly" }],
    },
    {
      ...policy,
      effectiveFrom: "2026-06-30" as CalendarDate,
      rules: [{ ...yearly, id: "third-yearly" }],
    },
  ];

  const lines = allowanceTargetOf(inputs);
  const grants = lines.filter((line) => line.kind === "entitlement_grant");
  const grantTotal = grants.reduce((sum, line) => sum + line.amount, 0);
  const rounding = lines.find((line) => line.kind === "rounding_up_to_half_day")!;

  expect(Number((grantTotal + rounding.amount).toFixed(6))).toEqual(28);
  expect(grantTotal).toBeCloseTo(28, 5);
  expect(rounding.amount).toBeCloseTo(0, 5);
});

it("returns a service extra before yearly entitlement when the policy lists it first", () => {
  const inputs = allowanceInputs();
  const policy = inputs.policies[0]!;
  inputs.serviceStart = "2020-01-01" as CalendarDate;
  inputs.policies = [
    {
      ...policy,
      rules: [
        { id: "two-years", kind: "service_extra", afterYears: 2, extraDays: 1 },
        ...policy.rules,
      ],
    },
  ];

  const lines = allowanceTargetOf(inputs);

  expect(
    lines.filter((line) => line.kind === "entitlement_grant").map((line) => line.allowanceRuleId),
  ).toEqual(["two-years", "yearly"]);
});

function allowanceInputs(): AllowanceTargetInputs {
  return {
    leaveYear: { start: "2026-01-01" as CalendarDate, end: "2026-12-31" as CalendarDate },
    employments: [{ startDate: null, endDate: null }],
    serviceStart: null,
    policies: [
      {
        effectiveFrom: null,
        effectiveUntil: null,
        balance: "balance_from_allowance",
        bankHolidays: "bank_holidays_included_in_allowance",
        rules: [
          {
            id: "yearly",
            kind: "yearly_entitlement",
            entitlementDays: 28,
            entitlementDaysPerWeek: 5,
            maxDays: 28,
          },
        ],
      },
    ],
    workingWeeks: [
      {
        effectiveFrom: "2026-01-01" as CalendarDate,
        minutes: [450, 450, 450, 450, 450, 0, 0],
        fullDayMinutes: 450,
        bankHolidayCalendar: "england_and_wales",
      },
    ],
    bankHolidays: new Map([
      [
        "england_and_wales",
        [
          "2026-01-01",
          "2026-04-03",
          "2026-04-06",
          "2026-05-04",
          "2026-05-25",
          "2026-08-31",
          "2026-12-25",
          "2026-12-28",
        ] as CalendarDate[],
      ],
      [
        "scotland",
        [
          "2026-01-01",
          "2026-01-02",
          "2026-04-03",
          "2026-05-04",
          "2026-05-25",
          "2026-08-03",
          "2026-11-30",
          "2026-12-25",
          "2026-12-28",
        ] as CalendarDate[],
      ],
    ]),
  };
}

function onTopPolicy(): DatedPolicy {
  return {
    effectiveFrom: null,
    effectiveUntil: null,
    balance: "balance_from_allowance",
    bankHolidays: "bank_holidays_on_top_of_allowance",
    rules: [
      {
        id: "yearly",
        kind: "yearly_entitlement",
        entitlementDays: 25,
        entitlementDaysPerWeek: 5,
        maxDays: null,
      },
    ],
  };
}
