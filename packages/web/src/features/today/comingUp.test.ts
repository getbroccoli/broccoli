import { expect, it } from "vitest";

import { comingUp } from "./comingUp";

it.each(["2026-11-27", "2026-12-10"])("includes a start on %s in the next fortnight", (date) => {
  const person = starter(date);

  expect(comingUp([person], "2026-11-27")).toEqual([{ kind: "STARTS", date, person }]);
});

it.each(["2026-11-26", "2026-12-11"])("leaves out a start on %s outside the fortnight", (date) => {
  expect(comingUp([starter(date)], "2026-11-27")).toEqual([]);
});

it("leaves out people without a start date", () => {
  expect(comingUp([starter(null)], "2026-11-27")).toEqual([]);
});

it.each([
  ["2024-11-27", "2026-11-27", 2],
  ["2023-12-02", "2026-12-02", 3],
  ["2025-12-10", "2026-12-10", 1],
] as const)(
  "shows the anniversary of a %s start on %s with %i whole years",
  (startDate, date, years) => {
    const person = starter(startDate);

    expect(comingUp([person], "2026-11-27")).toEqual([
      { kind: "ANNIVERSARY", date, years, person },
    ]);
  },
);

it.each(["2023-11-26", "2023-12-11"])(
  "leaves out an anniversary of %s outside the fortnight",
  (startDate) => {
    expect(comingUp([starter(startDate)], "2026-11-27")).toEqual([]);
  },
);

it("shows no anniversary before the first full year", () => {
  expect(comingUp([starter("2026-08-10")], "2026-11-27")).toEqual([]);
});

it("counts anniversary years across New Year", () => {
  const person = starter("2023-01-02");

  expect(comingUp([person], "2026-12-27")).toEqual([
    { kind: "ANNIVERSARY", date: "2027-01-02", years: 4, person },
  ]);
});

it.each([
  ["2026-02-20", "2026-02-28", 2],
  ["2028-02-20", "2028-02-29", 4],
] as const)(
  "observes a leap day anniversary in the fortnight from %s on %s",
  (today, date, years) => {
    const person = starter("2024-02-29");

    expect(comingUp([person], today)).toEqual([{ kind: "ANNIVERSARY", date, years, person }]);
  },
);

it("orders starts and anniversaries together by date, then first and last name", () => {
  const earliest = { id: "d", firstName: "Zoe", lastName: "West", startDate: "2026-11-28" };
  const adaBell = { id: "c", firstName: "Ada", lastName: "Bell", startDate: "2024-11-29" };
  const adaWest = { id: "b", firstName: "Ada", lastName: "West", startDate: "2026-11-29" };
  const ben = { id: "a", firstName: "Ben", lastName: "Ash", startDate: "2023-11-29" };

  const events = comingUp([ben, adaWest, adaBell, earliest], "2026-11-27");

  expect(events.map(({ person }) => person)).toEqual([earliest, adaBell, adaWest, ben]);
});

function starter(startDate: string | null) {
  return { id: "a", firstName: "Ada", lastName: "Bell", startDate };
}
