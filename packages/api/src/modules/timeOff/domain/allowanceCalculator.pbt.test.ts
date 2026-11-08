import Big from "big.js";
import fc from "fast-check";

import { allowanceInputs, calendarDate, expect, onTopPolicy, test } from "#test/support";

import { addDays, weekdayOf } from "../../../utils";

import { calculateAllowance } from "./index";

test("invariant: grants round up once to a half day across working-week changes", () => {
  // Changing the number of working days mid-year makes fractions; bank holidays taken are not grants.
  fc.assert(
    fc.property(
      workingMinutes(),
      workingMinutes(),
      fc.integer({ min: 1, max: 364 }),
      fc.boolean(),
      (before, after, changeDay, onTop) => {
        const inputs = allowanceInputs();
        if (onTop) inputs.policies = [onTopPolicy()];
        inputs.workingWeeks = [
          { ...inputs.workingWeeks[0]!, minutes: before },
          {
            ...inputs.workingWeeks[0]!,
            startDate: dayOf2026(changeDay),
            minutes: after,
          },
        ];
        const grants = calculateAllowance(inputs).filter(
          (line) => line.kind !== "bank_holiday_taken",
        );
        const rounded = grants.reduce((sum, line) => sum.plus(line.amount), Big(0));
        const unrounded = grants
          .filter((line) => line.kind !== "rounding_up_to_half_day")
          .reduce((sum, line) => sum.plus(line.amount), Big(0));

        expect(rounded.times(2).mod(1).toString()).toBe("0");
        expect(rounded.gte(unrounded)).toBe(true);
        expect(rounded.minus(unrounded).lt(0.5)).toBe(true);
      },
    ),
    { numRuns: 100, seed: 2092026 },
  );
});

test("invariant: statutory grants stay within 28 days", () => {
  fc.assert(
    fc.property(workingMinutes(), fc.integer({ min: 0, max: 364 }), (minutes, startDay) => {
      const inputs = allowanceInputs();
      inputs.workingWeeks = [{ ...inputs.workingWeeks[0]!, minutes }];
      inputs.employments = [{ startDate: dayOf2026(startDay), endDate: null }];
      const grants = calculateAllowance(inputs).filter(
        (line) => line.kind !== "bank_holiday_taken",
      );
      const total = grants.reduce((sum, line) => sum.plus(line.amount), Big(0));
      expect(total.gte(0) && total.lte(28)).toBe(true);
    }),
    { numRuns: 100, seed: 2092026 },
  );
});

test("invariant: the rounded statutory grant never falls below the exact entitlement", () => {
  fc.assert(
    fc.property(workingMinutes(), fc.integer({ min: 0, max: 364 }), (minutes, startDay) => {
      const inputs = allowanceInputs();
      inputs.workingWeeks = [{ ...inputs.workingWeeks[0]!, minutes }];
      inputs.employments = [{ startDate: dayOf2026(startDay), endDate: null }];
      const grant = calculateAllowance(inputs)
        .filter((line) => line.kind !== "bank_holiday_taken")
        .reduce((sum, line) => sum.plus(line.amount), Big(0));
      // Cross-multiply the spec's 28/5 × days per week × employed share: no decimal approximation.
      const annualNumerator = 28 * Math.min(minutes.filter((day) => day > 0).length, 5);
      expect(grant.times(5 * 365).gte(Big(annualNumerator).times(365 - startDay))).toBe(true);
    }),
    { numRuns: 100, seed: 2092026 },
  );
});

test("invariant: a year with no employed days has no calculated grant or bank holiday cost", () => {
  fc.assert(
    fc.property(
      workingMinutes(),
      fc.integer({ min: 0, max: 364 }),
      fc.boolean(),
      (minutes, offset, future) => {
        const inputs = allowanceInputs();
        inputs.workingWeeks = [{ ...inputs.workingWeeks[0]!, minutes }];
        inputs.employments = future
          ? [{ startDate: dayOf2026(365 + offset), endDate: null }]
          : [{ startDate: null, endDate: dayOf2026(-1 - offset) }];
        expect(calculateAllowance(inputs).every((line) => Big(line.amount).eq(0))).toBe(true);
      },
    ),
    { numRuns: 100, seed: 2092026 },
  );
});

test("invariant: a bank holiday costs one day on a working day and zero otherwise", () => {
  fc.assert(
    fc.property(
      workingMinutes(),
      fc.integer({ min: 0, max: 364 }),
      fc.boolean(),
      (minutes, startDay, scotland) => {
        const inputs = allowanceInputs();
        const calendar = scotland ? "scotland" : "england_and_wales";
        inputs.employments = [{ startDate: dayOf2026(startDay), endDate: null }];
        inputs.workingWeeks = [
          {
            ...inputs.workingWeeks[0]!,
            minutes,
            bankHolidayCalendar: calendar,
          },
        ];
        const expected = inputs.bankHolidays
          .get(calendar)!
          .filter((date) => date >= dayOf2026(startDay))
          .map((date) => ({
            date,
            amount: minutes[weekdayOf(date)]! > 0 ? -1 : 0,
          }));
        const taken = calculateAllowance(inputs).filter(
          (line) => line.kind === "bank_holiday_taken",
        );

        expect(
          taken.map((line) => ({ date: line.bankHolidayDate, amount: Number(line.amount) })),
        ).toEqual(expected);
      },
    ),
    { numRuns: 100, seed: 2092026 },
  );
});

// Include non-working days often enough to exercise different numbers of working days.
function workingMinutes() {
  return fc
    .array(fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 1440 })), {
      minLength: 7,
      maxLength: 7,
    })
    .filter((days) => days.some((day) => day > 0))
    .map((days) => days as [number, number, number, number, number, number, number]);
}

function dayOf2026(offset: number) {
  return addDays(calendarDate("2026-01-01"), offset);
}
