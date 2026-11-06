import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import { coversDate, makeRoomForDatedRow } from "./dated";

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

it("covers inclusive boundaries and treats null boundaries as open", () => {
  const row = {
    startDate: "2026-09-01" as CalendarDate,
    endDate: "2026-09-30" as CalendarDate,
  };
  expect(coversDate(row, "2026-08-31" as CalendarDate)).toBe(false);
  expect(coversDate(row, "2026-09-01" as CalendarDate)).toBe(true);
  expect(coversDate(row, "2026-09-30" as CalendarDate)).toBe(true);
  expect(coversDate(row, "2026-10-01" as CalendarDate)).toBe(false);
  expect(coversDate({ startDate: null, endDate: null }, "2026-09-01" as CalendarDate)).toBe(true);
});
