import { expect, it } from "vitest";

import { unshownCalls } from "./unshownCalls";

it("returns unshown calls after the start, oldest first", () => {
  const calls = [{ id: "5" }, { id: "4" }, { id: "3" }];

  const newCalls = unshownCalls(calls, "3", new Set());

  expect(newCalls).toEqual([{ id: "4" }, { id: "5" }]);
});

it("returns no calls when every call after the start was shown", () => {
  const calls = [{ id: "5" }, { id: "4" }, { id: "3" }];

  const newCalls = unshownCalls(calls, "3", new Set(["4", "5"]));

  expect(newCalls).toEqual([]);
});

it("returns every call oldest first when none existed at the start", () => {
  const calls = [{ id: "2" }, { id: "1" }];

  const newCalls = unshownCalls(calls, null, new Set());

  expect(newCalls).toEqual([{ id: "1" }, { id: "2" }]);
});

it("returns no calls from a read older than the start", () => {
  const calls = [{ id: "3" }, { id: "2" }, { id: "1" }];

  const newCalls = unshownCalls(calls, "5", new Set());

  expect(newCalls).toEqual([]);
});

it("returns a call that committed after a newer one was shown", () => {
  const calls = [{ id: "11" }, { id: "10" }, { id: "9" }];

  const newCalls = unshownCalls(calls, "9", new Set(["11"]));

  expect(newCalls).toEqual([{ id: "10" }]);
});

it("compares call ids numerically", () => {
  const calls = [{ id: "11" }, { id: "10" }];

  const newCalls = unshownCalls(calls, "9", new Set());

  expect(newCalls).toEqual([{ id: "10" }, { id: "11" }]);
});
