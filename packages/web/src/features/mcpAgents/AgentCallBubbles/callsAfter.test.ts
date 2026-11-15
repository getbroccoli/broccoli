import { expect, it } from "vitest";

import { callsAfter } from "./callsAfter";

it("returns calls newer than the last shown one, oldest first", () => {
  const calls = [
    { calledAt: "2026-11-15T10:00:05.000Z" },
    { calledAt: "2026-11-15T10:00:04.000Z" },
    { calledAt: "2026-11-15T10:00:03.000Z" },
  ];

  const newCalls = callsAfter(calls, "2026-11-15T10:00:03.000Z");

  expect(newCalls).toEqual([
    { calledAt: "2026-11-15T10:00:04.000Z" },
    { calledAt: "2026-11-15T10:00:05.000Z" },
  ]);
});

it("returns no calls when the last shown one is still the newest", () => {
  const calls = [
    { calledAt: "2026-11-15T10:00:05.000Z" },
    { calledAt: "2026-11-15T10:00:04.000Z" },
  ];

  const newCalls = callsAfter(calls, "2026-11-15T10:00:05.000Z");

  expect(newCalls).toEqual([]);
});

it("returns every call oldest first when none was shown before", () => {
  const calls = [
    { calledAt: "2026-11-15T10:00:02.000Z" },
    { calledAt: "2026-11-15T10:00:01.000Z" },
  ];

  const newCalls = callsAfter(calls, null);

  expect(newCalls).toEqual([
    { calledAt: "2026-11-15T10:00:01.000Z" },
    { calledAt: "2026-11-15T10:00:02.000Z" },
  ]);
});

it("returns no calls from a read older than the last shown call", () => {
  const calls = [
    { calledAt: "2026-11-15T10:00:03.000Z" },
    { calledAt: "2026-11-15T10:00:02.000Z" },
    { calledAt: "2026-11-15T10:00:01.000Z" },
  ];

  const newCalls = callsAfter(calls, "2026-11-15T10:00:05.000Z");

  expect(newCalls).toEqual([]);
});
