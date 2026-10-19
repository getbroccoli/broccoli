import { expect, it } from "vitest";

import { ringSeats } from "./ringSeats";

const people = (count: number) => Array.from({ length: count }, (_, index) => index);

it("seats everyone when they fit", () => {
  expect(ringSeats(people(3), 5)).toEqual([0, 1, 2]);
});

it("seats the first ten before any swap", () => {
  expect(ringSeats(people(12), 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

it("replaces one seat per swap, in turn, with the next person", () => {
  expect(ringSeats(people(12), 1)).toEqual([10, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(ringSeats(people(12), 2)).toEqual([10, 11, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(ringSeats(people(12), 3)).toEqual([10, 11, 0, 3, 4, 5, 6, 7, 8, 9]);
});

it("never seats the same person twice", () => {
  for (let swaps = 0; swaps < 40; swaps++) {
    expect(new Set(ringSeats(people(13), swaps)).size).toBe(10);
  }
});
