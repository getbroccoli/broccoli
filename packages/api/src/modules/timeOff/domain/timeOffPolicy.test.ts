import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import { leaveYearContaining } from "./timeOffPolicy";

it("includes 31 March in the fixed leave year starting the previous April", () => {
  const year = leaveYearContaining(
    { kind: "leave_year_from_fixed_date", month: 4, day: 1 },
    null,
    "2026-03-31" as CalendarDate,
  );

  expect(year).toEqual({ start: "2025-04-01", end: "2026-03-31" });
});

it("starts an employee-start leave year on the employee's anniversary", () => {
  const year = leaveYearContaining(
    { kind: "leave_year_from_employee_start_date" },
    "2020-09-15" as CalendarDate,
    "2026-06-01" as CalendarDate,
  );

  expect(year).toEqual({ start: "2025-09-15", end: "2026-09-14" });
});

it("starts an employee-start leave year on 1 January when the start date is unknown", () => {
  const year = leaveYearContaining(
    { kind: "leave_year_from_employee_start_date" },
    null,
    "2026-06-01" as CalendarDate,
  );

  expect(year).toEqual({ start: "2026-01-01", end: "2026-12-31" });
});
