import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import { makeRoomForDatedRow, parseDateField, parsePatternName, parseWeek } from "./workingPattern";

it("trims a pattern name", () => {
  expect(parsePatternName("  Monday  ")).toBe("Monday");
});

it("refuses a blank pattern name", () => {
  expect(() => parsePatternName("  ")).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "name", code: "required" }],
    }),
  );
});

it("accepts zero and 1440 weekday minutes", () => {
  const week = { minutes: [1440, 0, 0, 0, 0, 0, 0], fullDayMinutes: 1440 };
  expect(parseWeek(week)).toEqual(week);
});

it("refuses fewer than seven weekdays", () => {
  expect(() => parseWeek({ minutes: [450, 0, 0, 0, 0, 0], fullDayMinutes: 450 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses more than seven weekdays", () => {
  expect(() =>
    parseWeek({ minutes: [450, 0, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 }),
  ).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses negative weekday minutes", () => {
  expect(() => parseWeek({ minutes: [-1, 450, 0, 0, 0, 0, 0], fullDayMinutes: 450 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses weekday minutes above 1440", () => {
  expect(() => parseWeek({ minutes: [1441, 0, 0, 0, 0, 0, 0], fullDayMinutes: 1440 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses fractional weekday minutes", () => {
  expect(() => parseWeek({ minutes: [450.5, 0, 0, 0, 0, 0, 0], fullDayMinutes: 480 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "out_of_range" }],
    }),
  );
});

it("refuses a week with no working day", () => {
  expect(() => parseWeek({ minutes: [0, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "minutes", code: "no_working_day" }],
    }),
  );
});

it("refuses a zero full day", () => {
  expect(() => parseWeek({ minutes: [1, 0, 0, 0, 0, 0, 0], fullDayMinutes: 0 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "fullDayMinutes", code: "out_of_range" }],
    }),
  );
});

it("refuses a full day above 1440 minutes", () => {
  expect(() => parseWeek({ minutes: [1, 0, 0, 0, 0, 0, 0], fullDayMinutes: 1441 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "fullDayMinutes", code: "out_of_range" }],
    }),
  );
});

it("refuses fractional full day minutes", () => {
  expect(() => parseWeek({ minutes: [1, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450.5 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "fullDayMinutes", code: "out_of_range" }],
    }),
  );
});

it("refuses a full day shorter than the longest weekday", () => {
  expect(() => parseWeek({ minutes: [240, 0, 0, 0, 0, 0, 480], fullDayMinutes: 450 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "fullDayMinutes", code: "shorter_than_longest_day" }],
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

it("ends an earlier covering row, replaces a same-date row and leaves an expired row alone", () => {
  const row = {
    id: "row",
    startDate: null,
    endDate: null,
  };
  const from = "2026-09-01" as CalendarDate;
  expect(makeRoomForDatedRow([row], from, null)).toEqual({ ended: row, replaced: null });
  const sameDate = { ...row, startDate: from };
  expect(makeRoomForDatedRow([sameDate], from, null)).toEqual({
    ended: null,
    replaced: sameDate,
  });
  const expired = { ...row, endDate: "2026-08-31" as CalendarDate };
  expect(makeRoomForDatedRow([expired], from, null)).toEqual({ ended: null, replaced: null });
});

it("allows a new row only when it ends before a later row starts", () => {
  const row = {
    id: "later",
    startDate: "2026-10-01" as CalendarDate,
    endDate: null,
  };
  const from = "2026-09-01" as CalendarDate;
  const error = {
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "endDate", code: "overlaps" }],
  };
  expect(() => makeRoomForDatedRow([row], from, "2026-10-01" as CalendarDate)).toThrow(
    expect.objectContaining(error),
  );
  expect(() => makeRoomForDatedRow([row], from, null)).toThrow(expect.objectContaining(error));
  expect(makeRoomForDatedRow([row], from, "2026-09-30" as CalendarDate)).toEqual({
    ended: null,
    replaced: null,
  });
});
