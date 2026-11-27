import { expect, it } from "vitest";

import { whosOutSoon, type OutTimeOff } from "./whosOutSoon";

it.each([
  ["only today", booking("2026-11-27")],
  ["through today", booking("2026-11-25", "2026-11-26", "2026-11-27")],
  ["across today", booking("2026-11-26", "2026-11-27", "2026-11-28")],
] as const)("shows time off booked %s in today's list", (_period, timeOff) => {
  const employee = person("Ada", "Bell", [timeOff]);

  expect(whosOutSoon([employee], "2026-11-27")).toEqual({
    today: [{ person: employee, timeOff }],
    upcoming: [],
  });
});

it("shows a Friday and Monday booking as upcoming on Saturday", () => {
  const timeOff = booking("2026-11-27", "2026-11-30");
  const employee = person("Ada", "Bell", [timeOff]);

  expect(whosOutSoon([employee], "2026-11-28")).toEqual({
    today: [],
    upcoming: [{ person: employee, timeOff }],
  });
});

it("shows each upcoming booking for the same person", () => {
  const first = booking("2026-11-28", "2026-11-30");
  const second = booking("2026-12-05", "2026-12-06");
  const employee = person("Ada", "Bell", [first, second]);

  expect(whosOutSoon([employee], "2026-11-27")).toEqual({
    today: [],
    upcoming: [
      { person: employee, timeOff: first },
      { person: employee, timeOff: second },
    ],
  });
});

it("leaves out time off that ended before today", () => {
  const employee = person("Ada", "Bell", [booking("2026-11-25", "2026-11-26")]);

  expect(whosOutSoon([employee], "2026-11-27")).toEqual({ today: [], upcoming: [] });
});

it("includes a colleague's bookings when their status is hidden", () => {
  const current = { ...booking("2026-11-27"), status: null };
  const future = { ...booking("2026-11-30"), status: null };
  const employee = person("Ada", "Bell", [current, future]);

  expect(whosOutSoon([employee], "2026-11-27")).toEqual({
    today: [{ person: employee, timeOff: current }],
    upcoming: [{ person: employee, timeOff: future }],
  });
});

it.each(["REQUESTED", "REJECTED", "CANCELLED"] as const)(
  "leaves status %s out of both lists",
  (status) => {
    const current = { ...booking("2026-11-26", "2026-11-27", "2026-11-28"), status };
    const future = { ...booking("2026-11-29", "2026-11-30"), status };
    const employee = person("Ada", "Bell", [current, future]);

    expect(whosOutSoon([employee], "2026-11-27")).toEqual({ today: [], upcoming: [] });
  },
);

it("orders today's bookings by first and last name even when they started on different days", () => {
  const adaBell = person("Ada", "Bell", [booking("2026-11-27")]);
  const adaWest = person("Ada", "West", [booking("2026-11-26", "2026-11-27")]);
  const ben = person("Ben", "Ash", [booking("2026-11-25", "2026-11-27")]);

  const result = whosOutSoon([ben, adaWest, adaBell], "2026-11-27");

  expect(result.today.map(({ person }) => person)).toEqual([adaBell, adaWest, ben]);
});

it("orders upcoming bookings by their next booked date, then first and last name", () => {
  const earliest = person("Zoe", "West", [booking("2026-11-29")]);
  const adaBell = person("Ada", "Bell", [booking("2026-11-30")]);
  const adaWest = person("Ada", "West", [booking("2026-11-26", "2026-11-30")]);
  const ben = person("Ben", "Ash", [booking("2026-11-25", "2026-11-30")]);

  const result = whosOutSoon([ben, adaWest, adaBell, earliest], "2026-11-28");

  expect(result.upcoming.map(({ person }) => person)).toEqual([earliest, adaBell, adaWest, ben]);
});

function booking(startDate: string, ...laterDates: string[]): OutTimeOff {
  const days = [startDate, ...laterDates].map((date) => ({ date }));
  const endDate = laterDates.at(-1) ?? startDate;
  return { id: startDate + endDate, status: "APPROVED", startDate, endDate, days };
}

function person(firstName: string, lastName: string, timeOff: OutTimeOff[]) {
  return { id: lastName + firstName, firstName, lastName, whosOut: { timeOff } };
}
