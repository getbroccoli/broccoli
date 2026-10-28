import { expect, it } from "vitest";

import { ringSeats } from "./ringSeats";

it("seats everyone when they fit", () => {
  expect(ringSeats(people(3), 5)).toEqual([0, 1, 2]);
});

it("seats the first seven before any swap", () => {
  expect(ringSeats(people(9), 0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

it("replaces one seat per swap, in turn, with the next person", () => {
  expect(ringSeats(people(9), 1)).toEqual([7, 1, 2, 3, 4, 5, 6]);
  expect(ringSeats(people(9), 2)).toEqual([7, 8, 2, 3, 4, 5, 6]);
  expect(ringSeats(people(9), 3)).toEqual([7, 8, 0, 3, 4, 5, 6]);
});

it("never seats the same person twice", () => {
  for (let swaps = 0; swaps < 40; swaps++) {
    expect(new Set(ringSeats(people(13), swaps)).size).toBe(7);
  }
});

const people = (count: number) => Array.from({ length: count }, (_, index) => index);
