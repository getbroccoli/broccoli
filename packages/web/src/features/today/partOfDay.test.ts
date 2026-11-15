import { expect, it } from "vitest";

import { partOfDay } from "./partOfDay";

it.each([
  [0, 0, "morning"],
  [11, 59, "morning"],
  [12, 0, "afternoon"],
  [17, 59, "afternoon"],
  [18, 0, "evening"],
  [23, 59, "evening"],
] as const)("at %i:%i local time the greeting is %s", (hour, minute, expected) => {
  expect(partOfDay(new Date(2026, 10, 12, hour, minute))).toBe(expected);
});
