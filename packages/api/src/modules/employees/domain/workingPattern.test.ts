import { expect, it } from "vitest";

import { parseDateField, parseWeek } from "./workingPattern";

it("accepts zero and 1440 weekday minutes", () => {
  const week = { minutes: [1440, 0, 0, 0, 0, 0, 0] };
  expect(parseWeek(week)).toEqual(week);
});

it("refuses fewer than seven weekdays", () => {
  expect(() => parseWeek({ minutes: [450, 0, 0, 0, 0, 0] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses more than seven weekdays", () => {
  expect(() => parseWeek({ minutes: [450, 0, 0, 0, 0, 0, 0, 0] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses negative weekday minutes", () => {
  expect(() => parseWeek({ minutes: [-1, 450, 0, 0, 0, 0, 0] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses weekday minutes above 1440", () => {
  expect(() => parseWeek({ minutes: [1441, 0, 0, 0, 0, 0, 0] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses fractional weekday minutes", () => {
  expect(() => parseWeek({ minutes: [450.5, 0, 0, 0, 0, 0, 0] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses a week with no working day", () => {
  expect(() => parseWeek({ minutes: [0, 0, 0, 0, 0, 0, 0] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "no_working_day" }],
    }),
  );
});

it("accepts an existing calendar date", () => {
  expect(parseDateField("startDate", "2024-02-29")).toBe("2024-02-29");
});

it("refuses a date in the wrong format", () => {
  expect(() => parseDateField("startDate", "01/09/2026")).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "startDate", code: "invalid" }],
    }),
  );
});

it("refuses an impossible date on the supplied field", () => {
  expect(() => parseDateField("endDate", "2026-02-30")).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "endDate", code: "invalid" }],
    }),
  );
});
