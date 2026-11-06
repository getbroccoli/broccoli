import Big from "big.js";

import {
  addDays,
  addYears,
  type CalendarDate,
  daysBetween,
  isWithin,
  weekdayOf,
} from "../../../utils";
import type { BankHolidayCalendar } from "../../bankHolidays";

/** Everything one allowance's target depends on. */
export interface AllowanceInputs {
  leaveYear: { start: CalendarDate; end: CalendarDate };
  employments: readonly EmploymentPeriod[];
  /** The first employment's start, from which service steps count; null: no step is reached. */
  serviceStart: CalendarDate | null;
  /** Oldest first, never overlapping. */
  policies: readonly DatedPolicy[];
  /** Oldest first; before the first one the person has no working week. */
  workingWeeks: readonly DatedWorkingWeek[];
  /** Each calendar's bank holiday dates. */
  bankHolidays: ReadonlyMap<BankHolidayCalendar, readonly CalendarDate[]>;
}

/** One line identity of an allowance and the amount its ledger lines should add up to. */
export interface CalculatedAllowanceLine {
  kind:
    | "entitlement_grant"
    | "bank_holiday_allowance_grant"
    | "bank_holiday_taken"
    | "rounding_up_to_half_day";
  /** Set on entitlement grants only. */
  allowanceRuleId: string | null;
  /** Set on bank holidays taken only. */
  bankHolidayDate: CalendarDate | null;
  /** Days as decimal text rounded to six places, like Postgres `numeric` returns ("6.213699"). */
  amount: string;
  /** The first day of the earliest part of the leave year that contributes to this line. */
  firstDate: CalendarDate;
}

/** A person's employment; a null start or end is open. */
export interface EmploymentPeriod {
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
}

/** The policy that applies to the person for this type from a date to a date; null is open. */
export interface DatedPolicy {
  startDate: CalendarDate | null;
  /** The last day it applies. */
  endDate: CalendarDate | null;
  balance: "balance_from_allowance" | "unlimited_balance" | "no_balance";
  /** Null unless the balance is `balance_from_allowance`. */
  bankHolidays: "bank_holidays_included_in_allowance" | "bank_holidays_on_top_of_allowance" | null;
  rules: readonly AllowanceRule[];
}

/** What a person works from a date until the next week; minutes null while they have no pattern. */
export interface DatedWorkingWeek {
  startDate: CalendarDate;
  minutes: WeekdayMinutes | null;
  fullDayMinutes: number | null;
  bankHolidayCalendar: BankHolidayCalendar | null;
}

/** One part of a policy's allowance, as stored in `time_off_allowance_rules`. */
export type AllowanceRule =
  | {
      id: string;
      kind: "yearly_entitlement";
      /** Days for a working week of `entitlementDaysPerWeek` days (28 for 5). */
      entitlementDays: number;
      entitlementDaysPerWeek: number;
      /** The most a full year grants; null: no cap. */
      maxDays: number | null;
    }
  | {
      id: string;
      kind: "service_extra";
      /** The step is reached on this anniversary of the service start. */
      afterYears: number;
      /** Extra days a year for a full-time week, from that step. */
      extraDays: number;
    };

/** Minutes worked on each weekday, Monday to Sunday; 0 is not working. */
export type WeekdayMinutes = readonly [number, number, number, number, number, number, number];

/**
 * The lines an allowance should have: entitlement grants in the order they first grant (rule
 * order within a part), the bank holiday allowance grant, bank holidays taken by date, then the
 * rounding up to the half day.
 */
export function calculateAllowance(inputs: AllowanceInputs): CalculatedAllowanceLine[] {
  const parts = keptParts(inputs);
  const lines: Lines = new Map();
  for (const part of parts) {
    addPart(lines, inputs, part);
  }
  const exact = [...lines.values()].toSorted(byLineOrder);
  const target = exact.map((line) => ({ ...line, amount: toAmount(line.amount) }));
  const rounding = roundingUpToHalfDay(exact);
  return rounding === null ? target : [...target, { ...rounding, firstDate: parts[0]!.from }];
}

/** A full year's entitlement for `daysPerWeek` working days, pro-rated and capped. */
export function yearlyDays(
  rule: Omit<Extract<AllowanceRule, { kind: "yearly_entitlement" }>, "id">,
  daysPerWeek: Big,
): Big {
  const days = daysPerWeek.times(rule.entitlementDays).div(rule.entitlementDaysPerWeek);
  return rule.maxDays === null || days.lte(rule.maxDays) ? days : Big(rule.maxDays);
}

/** A stretch of the leave year in which nothing the target depends on changes. */
interface Part {
  from: CalendarDate;
  until: CalendarDate;
  policy: DatedPolicy;
  minutes: WeekdayMinutes;
  fullDayMinutes: number;
  bankHolidays: readonly CalendarDate[];
}

type Identity = Pick<CalculatedAllowanceLine, "kind" | "allowanceRuleId" | "bankHolidayDate">;

/** A line with its exact amount, not yet rounded. */
type ExactLine = Omit<CalculatedAllowanceLine, "amount"> & { amount: Big };

/** Each identity's line. */
type Lines = Map<string, ExactLine>;

function keptParts(inputs: AllowanceInputs): Part[] {
  const starts = partStarts(inputs);
  return starts.flatMap((from, index) => {
    const next = starts[index + 1];
    const until = next ? addDays(next, -1) : inputs.leaveYear.end;
    const employed = inputs.employments.some(({ startDate, endDate }) =>
      isWithin(from, startDate, endDate),
    );
    const policy = inputs.policies.find(({ startDate, endDate }) =>
      isWithin(from, startDate, endDate),
    );
    const week = inputs.workingWeeks.findLast(({ startDate }) => startDate <= from);
    const { minutes, fullDayMinutes, bankHolidayCalendar } = week ?? {};
    if (!employed || policy?.balance !== "balance_from_allowance" || !minutes || !fullDayMinutes) {
      return [];
    }
    const bankHolidays =
      (bankHolidayCalendar && inputs.bankHolidays.get(bankHolidayCalendar)) || [];
    return [
      {
        from,
        until,
        policy,
        minutes,
        fullDayMinutes,
        bankHolidays,
      },
    ];
  });
}

function partStarts(inputs: AllowanceInputs): CalendarDate[] {
  const { leaveYear, employments, policies, workingWeeks, serviceStart } = inputs;
  const changes = [
    ...employments.flatMap(({ startDate, endDate }) => [startDate, endDate && addDays(endDate, 1)]),
    ...policies.flatMap(({ startDate, endDate }) => [startDate, endDate && addDays(endDate, 1)]),
    ...workingWeeks.map(({ startDate }) => startDate),
    ...policies.flatMap(({ rules }) =>
      rules.map((rule) =>
        rule.kind === "service_extra" && serviceStart
          ? addYears(serviceStart, rule.afterYears)
          : null,
      ),
    ),
  ].filter(
    (date): date is CalendarDate =>
      date !== null && date > leaveYear.start && date <= leaveYear.end,
  );
  return [leaveYear.start, ...new Set(changes)].toSorted();
}

function addPart(lines: Lines, inputs: AllowanceInputs, part: Part): void {
  const { leaveYear } = inputs;
  const daysPerWeek = Big(part.minutes.reduce((sum, minutes) => sum + minutes, 0)).div(
    part.fullDayMinutes,
  );
  const share = Big(daysBetween(part.from, part.until) + 1).div(
    daysBetween(leaveYear.start, leaveYear.end) + 1,
  );
  const yearly = part.policy.rules.find((rule) => rule.kind === "yearly_entitlement");
  const fullTimeDays = yearly?.entitlementDaysPerWeek ?? FULL_TIME_DAYS_PER_WEEK;
  const step = serviceStepOn(part.policy, inputs.serviceStart, part.from);
  for (const rule of part.policy.rules) {
    if (rule.kind === "yearly_entitlement") {
      addAmount(lines, grantOf(rule.id), part, yearlyDays(rule, daysPerWeek).times(share));
    } else if (rule === step) {
      addAmount(
        lines,
        grantOf(rule.id),
        part,
        daysPerWeek.times(rule.extraDays).div(fullTimeDays).times(share),
      );
    }
  }
  if (part.policy.bankHolidays === "bank_holidays_on_top_of_allowance") {
    const inYear = part.bankHolidays.filter((date) =>
      isWithin(date, leaveYear.start, leaveYear.end),
    );
    const identity = {
      kind: "bank_holiday_allowance_grant",
      allowanceRuleId: null,
      bankHolidayDate: null,
    } as const;
    addAmount(
      lines,
      identity,
      part,
      daysPerWeek.times(inYear.length).div(FULL_TIME_DAYS_PER_WEEK).times(share),
    );
  }
  for (const date of part.bankHolidays.filter((date) => isWithin(date, part.from, part.until))) {
    const identity = {
      kind: "bank_holiday_taken",
      allowanceRuleId: null,
      bankHolidayDate: date,
    } as const;
    addAmount(lines, identity, part, Big(-part.minutes[weekdayOf(date)]!).div(part.fullDayMinutes));
  }
}

/** The highest service step reached on `date`, if any. */
function serviceStepOn(
  policy: DatedPolicy,
  serviceStart: CalendarDate | null,
  date: CalendarDate,
): Extract<AllowanceRule, { kind: "service_extra" }> | undefined {
  return policy.rules
    .filter((rule) => rule.kind === "service_extra")
    .filter((rule) => serviceStart !== null && addYears(serviceStart, rule.afterYears) <= date)
    .toSorted((a, b) => b.afterYears - a.afterYears)[0];
}

function addAmount(lines: Lines, identity: Identity, part: Part, amount: Big): void {
  const key = `${identity.kind}:${identity.allowanceRuleId}:${identity.bankHolidayDate}`;
  const line = lines.get(key) ?? { ...identity, amount: Big(0), firstDate: part.from };
  lines.set(key, { ...line, amount: line.amount.plus(amount) });
}

/**
 * What brings the rounded grants to their exact sum rounded up once to the half day; null without
 * grants. Rounding the exact sum, not the rounded lines, keeps a split grant from gaining a half day.
 */
function roundingUpToHalfDay(
  exactLines: readonly ExactLine[],
): Omit<CalculatedAllowanceLine, "firstDate"> | null {
  const grants = exactLines.filter((line) => line.kind !== "bank_holiday_taken");
  if (grants.length === 0) {
    return null;
  }
  const exactSum = grants.reduce((total, line) => total.plus(line.amount), Big(0));
  const roundedSum = grants.reduce(
    (total, line) => total.plus(line.amount.round(DECIMALS)),
    Big(0),
  );
  const roundedUp = exactSum.times(2).round(0, Big.roundUp).div(2);
  return {
    kind: "rounding_up_to_half_day",
    allowanceRuleId: null,
    bankHolidayDate: null,
    amount: toAmount(roundedUp.minus(roundedSum)),
  };
}

function grantOf(allowanceRuleId: string): Identity {
  return { kind: "entitlement_grant", allowanceRuleId, bankHolidayDate: null };
}

function byLineOrder(a: ExactLine, b: ExactLine): number {
  const byKind = LINE_ORDER.indexOf(a.kind) - LINE_ORDER.indexOf(b.kind);
  return byKind || (a.bankHolidayDate ?? "").localeCompare(b.bankHolidayDate ?? "");
}

function toAmount(days: Big): string {
  return days.round(DECIMALS).toString();
}

/** The scale of the amounts' Postgres `numeric`. */
const DECIMALS = 6;
const FULL_TIME_DAYS_PER_WEEK = 5;
const LINE_ORDER: readonly CalculatedAllowanceLine["kind"][] = [
  "entitlement_grant",
  "bank_holiday_allowance_grant",
  "bank_holiday_taken",
  "rounding_up_to_half_day",
];
