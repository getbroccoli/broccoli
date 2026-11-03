import { expect, it } from "vitest";

import { allowanceInputs, onTopPolicy, targetRowsOf } from "#test/support";

import { allowanceTargetOf } from "./allowanceTarget";

it("grants eight bank holidays on top of 25 days and still takes each holiday", () => {
  const inputs = allowanceInputs();
  inputs.policies = [onTopPolicy()];

  const lines = allowanceTargetOf(inputs);

  expect(targetRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "25"],
    ["bank_holiday_allowance_grant", null, "8"],
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
});

it("counts a half-length Friday as half a day for entitlement and Good Friday", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [{ ...inputs.workingWeeks[0]!, minutes: [450, 450, 450, 450, 225, 0, 0] }];

  const lines = allowanceTargetOf(inputs);

  expect(targetRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "25.2"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-0.5"],
    ["bank_holiday_taken", "2026-04-06", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-31", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-0.5"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0.3"],
  ]);
});

it("takes the working week's Scottish bank holidays", () => {
  const inputs = allowanceInputs();
  inputs.workingWeeks = [{ ...inputs.workingWeeks[0]!, bankHolidayCalendar: "scotland" }];

  const lines = allowanceTargetOf(inputs);

  expect(targetRowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "28"],
    ["bank_holiday_taken", "2026-01-01", "-1"],
    ["bank_holiday_taken", "2026-01-02", "-1"],
    ["bank_holiday_taken", "2026-04-03", "-1"],
    ["bank_holiday_taken", "2026-05-04", "-1"],
    ["bank_holiday_taken", "2026-05-25", "-1"],
    ["bank_holiday_taken", "2026-08-03", "-1"],
    ["bank_holiday_taken", "2026-11-30", "-1"],
    ["bank_holiday_taken", "2026-12-25", "-1"],
    ["bank_holiday_taken", "2026-12-28", "-1"],
    ["rounding_up_to_half_day", null, "0"],
  ]);
});
