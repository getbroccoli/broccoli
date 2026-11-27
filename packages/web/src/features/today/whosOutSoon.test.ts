import { expect, it } from "vitest";

import { whosOutSoon, type OutTimeOff } from "./whosOutSoon";

it.each([
  ["2026-11-27", "2026-11-27"],
  ["2026-11-25", "2026-11-27"],
  ["2026-11-26", "2026-11-28"],
])("shows time off from %s through %s in today's list", (startDate, endDate) => {
  const timeOff = booking(startDate, endDate);
  const employee = person("Ada", "Bell", [timeOff]);

  expect(whosOutSoon([employee], "2026-11-27")).toEqual({
    today: [{ person: employee, timeOff }],
    upcoming: [],
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

it.each(["REQUESTED", "REJECTED", "CANCELLED", null] as const)(
  "leaves status %s out of both lists",
  (status) => {
    const current = { ...booking("2026-11-26", "2026-11-28"), status };
    const future = { ...booking("2026-11-29", "2026-11-30"), status };
    const employee = person("Ada", "Bell", [current, future]);

    expect(whosOutSoon([employee], "2026-11-27")).toEqual({ today: [], upcoming: [] });
  },
);

it.each([
  ["today", "2026-11-27"],
  ["upcoming", "2026-11-24"],
] as const)("orders the %s list by start date, then first and last name", (list, today) => {
  const earliest = person("Zoe", "West", [booking("2026-11-25", "2026-11-28")]);
  const adaBell = person("Ada", "Bell", [booking("2026-11-26", "2026-11-30")]);
  const adaWest = person("Ada", "West", [booking("2026-11-26", "2026-11-29")]);
  const ben = person("Ben", "Ash", [booking("2026-11-26", "2026-11-28")]);

  const result = whosOutSoon([ben, adaWest, adaBell, earliest], today);

  expect(result[list].map(({ person }) => person)).toEqual([earliest, adaBell, adaWest, ben]);
});

function booking(startDate: string, endDate: string): OutTimeOff {
  return { id: startDate + endDate, status: "APPROVED", startDate, endDate };
}

function person(firstName: string, lastName: string, timeOff: OutTimeOff[]) {
  return { id: lastName + firstName, firstName, lastName, whosOut: { timeOff } };
}
