import { expect, it } from "vitest";

import { timeOffFigures } from "./timeOffFigures";

it("deducts included bank holidays from the statutory entitlement", () => {
  const figures = timeOffFigures([
    { kind: "entitlement_grant", amount: 28 },
    { kind: "bank_holiday_taken", amount: -8 },
  ]);

  expect(figures).toEqual({ entitlement: 28, bankHolidays: 8, used: 0, remaining: 20 });
});

it("includes bank holidays granted on top in entitlement", () => {
  const figures = timeOffFigures([
    { kind: "entitlement_grant", amount: 25 },
    { kind: "bank_holiday_allowance_grant", amount: 8 },
    { kind: "bank_holiday_taken", amount: -8 },
  ]);

  expect(figures).toEqual({ entitlement: 33, bankHolidays: 8, used: 0, remaining: 25 });
});

it("includes the half-day rounding grant in a joiner's entitlement", () => {
  const figures = timeOffFigures([
    { kind: "entitlement_grant", amount: 6.213699 },
    { kind: "rounding_up_to_half_day", amount: 0.286301 },
    { kind: "bank_holiday_taken", amount: -2 },
  ]);

  expect(figures).toEqual({ entitlement: 6.5, bankHolidays: 2, used: 0, remaining: 4.5 });
});

it("adds manual adjustments to entitlement and counts booked days as used", () => {
  const figures = timeOffFigures([
    { kind: "entitlement_grant", amount: 28 },
    { kind: "manual_adjustment", amount: 2 },
    { kind: "time_off_booked", amount: -3 },
  ]);

  expect(figures).toEqual({ entitlement: 30, bankHolidays: 0, used: 3, remaining: 27 });
});

it("derives remaining days from the figures rounded to two decimals", () => {
  const figures = timeOffFigures([
    { kind: "entitlement_grant", amount: 22.4 },
    { kind: "rounding_up_to_half_day", amount: 0.1 },
    { kind: "bank_holiday_taken", amount: -6.4 },
    { kind: "time_off_booked", amount: -1.333333 },
  ]);

  expect(figures).toEqual({ entitlement: 22.5, bankHolidays: 6.4, used: 1.33, remaining: 14.77 });
});

it("rounds a half-hundredth bank holiday amount up before deriving remaining days", () => {
  const figures = timeOffFigures([
    { kind: "entitlement_grant", amount: 28 },
    { kind: "bank_holiday_taken", amount: -1.005 },
  ]);

  expect(figures).toEqual({ entitlement: 28, bankHolidays: 1.01, used: 0, remaining: 26.99 });
});
