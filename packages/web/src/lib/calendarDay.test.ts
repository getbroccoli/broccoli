process.env.TZ = "America/Los_Angeles";

import { expect, it } from "vitest";

import { addDays } from "./calendarDay";

it("adds and subtracts days across month end", () => {
  expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
  expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
});

it("adds and subtracts days through leap day", () => {
  expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  expect(addDays("2024-02-29", -1)).toBe("2024-02-28");
});

it("adds and subtracts days across year end", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
});
