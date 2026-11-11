import { expect, it } from "vitest";

import type { CalendarDate } from "../../../utils";
import { planReplacement } from "./assignment";

it("keeps earlier days and the old assignment's end when replacing from a date", () => {
  const rows = [row("current", "old", "2026-01-01", "2026-09-30")];

  expect(planReplacement(rows, (row) => row.versionId === "old", date("2026-06-01"))).toEqual({
    ended: [{ id: "current", endDate: "2026-05-31" }],
    deletedIds: [],
    added: [{ startDate: "2026-06-01", endDate: "2026-09-30" }],
  });
});

it("replaces a same-date assignment without leaving an empty row", () => {
  const rows = [row("current", "old", "2026-06-01")];

  expect(planReplacement(rows, (row) => row.versionId === "old", date("2026-06-01"))).toEqual({
    ended: [],
    deletedIds: ["current"],
    added: [{ startDate: "2026-06-01", endDate: null }],
  });
});

it("merges contiguous replacement spans into one assignment", () => {
  const rows = [
    row("current", "source", "2026-01-01", "2026-12-31"),
    row("later", "source", "2027-01-01"),
  ];

  expect(planReplacement(rows, (row) => row.versionId === "source", date("2026-07-01"))).toEqual({
    ended: [{ id: "current", endDate: "2026-06-30" }],
    deletedIds: ["later"],
    added: [{ startDate: "2026-07-01", endDate: null }],
  });
});

it("replaces later matching assignments from their own starts and keeps unrelated rows", () => {
  const rows = [
    row("past", "old", "2026-01-01", "2026-04-30"),
    row("current", "old", "2026-05-01", "2026-06-30"),
    row("other", "unrelated", "2026-07-01", "2026-08-31"),
    row("later", "old", "2026-09-01"),
  ];

  expect(planReplacement(rows, (row) => row.versionId === "old", date("2026-06-01"))).toEqual({
    ended: [{ id: "current", endDate: "2026-05-31" }],
    deletedIds: ["later"],
    added: [
      { startDate: "2026-06-01", endDate: "2026-06-30" },
      { startDate: "2026-09-01", endDate: null },
    ],
  });
});

it("adds an open-ended assignment when the owner has no source", () => {
  expect(planReplacement([], () => false, date("2026-06-01"))).toEqual({
    ended: [],
    deletedIds: [],
    added: [{ startDate: "2026-06-01", endDate: null }],
  });
});

it("refuses an open-ended assignment that overlaps a later unrelated row", () => {
  const rows = [row("later", "unrelated", "2026-09-01")];

  expect(() => planReplacement(rows, () => false, date("2026-06-01"))).toThrow(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "endDate", code: "overlaps" }],
    }),
  );
});

function date(value: string): CalendarDate {
  return value as CalendarDate;
}
function row(id: string, versionId: string, startDate: string, endDate: string | null = null) {
  return {
    id,
    versionId,
    owner: { termsId: "terms" },
    startDate: date(startDate),
    endDate: endDate === null ? null : date(endDate),
  };
}
