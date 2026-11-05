import { expect, it } from "vitest";

import { parseTimeOffTypeUpdate, timeOffTypeChanges } from "./timeOffTypeChanges";

it.each([366.5, 20.25])("refuses an allowance of %s days", (allowanceDays) => {
  expect(() =>
    parseTimeOffTypeUpdate({
      id: "019b76da-a800-7000-8000-000000000001",
      policies: [{ id: "019b76da-a800-7000-8000-000000000002", allowanceDays }],
    }),
  ).toThrow(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "policies.0.allowanceDays", code: "invalid" }],
    }),
  );
});

it("refuses a blank name", () => {
  expect(() =>
    parseTimeOffTypeUpdate({
      id: "019b76da-a800-7000-8000-000000000001",
      name: "   ",
    }),
  ).toThrow(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "name", code: "required" }],
    }),
  );
});

it("lists only the fields that changed", () => {
  const before = {
    name: "Holiday",
    icon: "sun",
    colour: "green",
    reasonVisibleToColleagues: true,
  } as const;

  const changes = timeOffTypeChanges(before, { ...before, name: "Annual leave", colour: "blue" });

  expect(changes).toEqual([
    { field: "name", oldValue: "Holiday", newValue: "Annual leave" },
    { field: "colour", oldValue: "green", newValue: "blue" },
  ]);
});
