import { expect, it } from "vitest";

import { upcomingTimeOff, type OwnTimeOff } from "./upcomingTimeOff";

it.each(["REQUESTED", "APPROVED"] as const)("keeps %s time off through its last day", (status) => {
  const endingToday = { id: "ending", status, startDate: "2026-11-25", endDate: "2026-11-27" };
  const future = { id: "future", status, startDate: "2026-11-28", endDate: "2026-11-30" };

  expect(upcomingTimeOff([endingToday, future], "2026-11-27")).toEqual([endingToday, future]);
});

it.each(["REJECTED", "CANCELLED", null] as const)(
  "leaves out time off with status %s",
  (status) => {
    const request = { id: "leave", status, startDate: "2026-11-28", endDate: "2026-11-30" };

    expect(upcomingTimeOff([request], "2026-11-27")).toEqual([]);
  },
);

it("leaves out time off that ended yesterday", () => {
  const request: OwnTimeOff = {
    id: "ended",
    status: "APPROVED",
    startDate: "2026-11-24",
    endDate: "2026-11-26",
  };

  expect(upcomingTimeOff([request], "2026-11-27")).toEqual([]);
});

it("orders time off by start date", () => {
  const earlier: OwnTimeOff = {
    id: "b",
    status: "APPROVED",
    startDate: "2026-11-26",
    endDate: "2026-12-02",
  };
  const later: OwnTimeOff = {
    id: "a",
    status: "REQUESTED",
    startDate: "2026-11-30",
    endDate: "2026-11-30",
  };

  expect(upcomingTimeOff([later, earlier], "2026-11-27")).toEqual([earlier, later]);
});
