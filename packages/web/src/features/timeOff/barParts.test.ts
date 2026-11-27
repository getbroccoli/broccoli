import { expect, it } from "vitest";

import { barParts } from "./barParts";

it("omits booked days on non-working days and bank holidays", () => {
  const parts = barParts({
    days: [
      { date: "2026-12-24", kind: "NOT_A_WORKING_DAY" },
      { date: "2026-12-25", kind: "BANK_HOLIDAY" },
    ],
    timeOff: [
      {
        id: "leave",
        days: [
          { date: "2026-12-24", dayPart: "FULL_DAY" },
          { date: "2026-12-25", dayPart: "FULL_DAY" },
        ],
      },
    ],
  });

  expect(parts).toEqual(new Map());
});

it("rounds both sides of a Thursday the person no longer works", () => {
  const days = [
    { date: "2026-12-07", kind: "WORKING_DAY" },
    { date: "2026-12-08", kind: "WORKING_DAY" },
    { date: "2026-12-09", kind: "WORKING_DAY" },
    { date: "2026-12-10", kind: "NOT_A_WORKING_DAY" },
    { date: "2026-12-11", kind: "WORKING_DAY" },
  ] as const;

  const parts = barParts({
    days,
    timeOff: [{ id: "leave", days: days.map(({ date }) => ({ date, dayPart: "FULL_DAY" })) }],
  });

  expect(parts.get("2026-12-09")).toEqual([
    { timeOffId: "leave", dayPart: "FULL_DAY", roundStart: false, roundEnd: true },
  ]);
  expect(parts.get("2026-12-11")).toEqual([
    { timeOffId: "leave", dayPart: "FULL_DAY", roundStart: true, roundEnd: true },
  ]);
});

it("ends the run at a booked morning", () => {
  const parts = barParts({
    days: [tuesday, wednesday, thursday],
    timeOff: [
      {
        id: "leave",
        days: [
          { date: tuesday.date, dayPart: "FULL_DAY" },
          { date: wednesday.date, dayPart: "MORNING" },
          { date: thursday.date, dayPart: "FULL_DAY" },
        ],
      },
    ],
  });

  expect(parts.get(tuesday.date)).toMatchObject([{ roundEnd: false }]);
  expect(parts.get(wednesday.date)).toEqual([
    { timeOffId: "leave", dayPart: "MORNING", roundStart: false, roundEnd: true },
  ]);
  expect(parts.get(thursday.date)).toMatchObject([{ roundStart: true }]);
});

it("rounds both ends of a lone afternoon", () => {
  const parts = barParts({
    days: [tuesday],
    timeOff: [{ id: "leave", days: [{ date: tuesday.date, dayPart: "AFTERNOON" }] }],
  });

  expect(parts.get(tuesday.date)).toEqual([
    { timeOffId: "leave", dayPart: "AFTERNOON", roundStart: true, roundEnd: true },
  ]);
});

it("breaks a booking's run across a weekend", () => {
  const parts = barParts({
    days: [
      { date: "2026-12-11", kind: "WORKING_DAY" },
      { date: "2026-12-12", kind: "NOT_A_WORKING_DAY" },
      { date: "2026-12-13", kind: "NOT_A_WORKING_DAY" },
      { date: "2026-12-14", kind: "WORKING_DAY" },
    ],
    timeOff: [
      {
        id: "leave",
        days: [
          { date: "2026-12-11", dayPart: "FULL_DAY" },
          { date: "2026-12-14", dayPart: "FULL_DAY" },
        ],
      },
    ],
  });

  expect(parts.get("2026-12-11")).toMatchObject([{ roundEnd: true }]);
  expect(parts.get("2026-12-14")).toMatchObject([{ roundStart: true }]);
});

const tuesday = { date: "2026-12-08", kind: "WORKING_DAY" } as const;
const wednesday = { date: "2026-12-09", kind: "WORKING_DAY" } as const;
const thursday = { date: "2026-12-10", kind: "WORKING_DAY" } as const;
