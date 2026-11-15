import { expect, it } from "vitest";

import { callsAfter } from "./callsAfter";

it("returns calls after the last shown one, oldest first", () => {
  const calls = [{ id: "5" }, { id: "4" }, { id: "3" }];

  const newCalls = callsAfter(calls, "3");

  expect(newCalls).toEqual([{ id: "4" }, { id: "5" }]);
});

it("returns no calls when the last shown one is still the newest", () => {
  const calls = [{ id: "5" }, { id: "4" }];

  const newCalls = callsAfter(calls, "5");

  expect(newCalls).toEqual([]);
});

it("returns every call oldest first when none was shown before", () => {
  const calls = [{ id: "2" }, { id: "1" }];

  const newCalls = callsAfter(calls, null);

  expect(newCalls).toEqual([{ id: "1" }, { id: "2" }]);
});

it("returns no calls from a read older than the last shown call", () => {
  const calls = [{ id: "3" }, { id: "2" }, { id: "1" }];

  const newCalls = callsAfter(calls, "5");

  expect(newCalls).toEqual([]);
});

it("compares call ids numerically", () => {
  const calls = [{ id: "11" }, { id: "10" }];

  const newCalls = callsAfter(calls, "9");

  expect(newCalls).toEqual([{ id: "10" }, { id: "11" }]);
});
