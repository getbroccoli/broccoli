import { expect, it } from "vitest";

import { teamOf } from "./team";

it("includes the viewer's manager, peers and direct reports only", () => {
  const people = [
    { id: "manager", managerId: null },
    { id: "viewer", managerId: "manager" },
    { id: "peer", managerId: "manager" },
    { id: "report", managerId: "viewer" },
    { id: "other", managerId: "peer" },
  ];

  expect(teamOf(people, "viewer")).toEqual(new Set(["manager", "peer", "report"]));
});

it("includes only direct reports when the viewer has no manager", () => {
  const people = [
    { id: "viewer", managerId: null },
    { id: "other", managerId: null },
    { id: "report", managerId: "viewer" },
  ];

  expect(teamOf(people, "viewer")).toEqual(new Set(["report"]));
});

it("returns an empty team when the viewer has neither manager nor reports", () => {
  expect(teamOf([{ id: "viewer", managerId: null }], "viewer")).toEqual(new Set());
});

it("finds direct reports when the viewer is missing from the list", () => {
  const people = [
    { id: "report", managerId: "viewer" },
    { id: "other", managerId: "report" },
  ];

  expect(teamOf(people, "viewer")).toEqual(new Set(["report"]));
});
