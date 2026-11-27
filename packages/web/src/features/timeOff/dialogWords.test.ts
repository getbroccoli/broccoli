import { expect, it } from "vitest";

import {
  bookedToast,
  dialogWords,
  headerButtons,
  headerMode,
  modeForType,
  requestedToast,
} from "./timeOffText";

it.each([
  [["ALLOWED_WITH_APPROVAL", "ALLOWED"], "book"],
  [["NOT_ALLOWED", "ALLOWED_WITH_APPROVAL"], "request"],
  [["NOT_ALLOWED"], null],
  [[], null],
] as const)("chooses the header action for %j", (permits, expected) => {
  expect(headerMode(permits)).toBe(expected);
});

it.each([
  ["book", "MANAGER_APPROVAL", "book"],
  ["book", "OWNER_APPROVAL", "book"],
  ["book", "NO_APPROVAL", "book"],
  ["book", null, "book"],
  ["request", "MANAGER_APPROVAL", "request"],
  ["request", "OWNER_APPROVAL", "request"],
  ["request", "NO_APPROVAL", "book"],
  ["request", null, "request"],
] as const)("opens the %s dialog for approval %s in %s mode", (mode, approval, expected) => {
  expect(modeForType(mode, approval)).toBe(expected);
});

it.each([
  ["book", 2.5, "Book time off", "Booked straight away.", "Book 2.5 days"],
  ["book", null, "Book time off", "Booked straight away.", "Book time off"],
  ["request", 2.5, "Request time off", "Sent for approval.", "Request 2.5 days"],
  ["request", null, "Request time off", "Sent for approval.", "Request time off"],
] as const)("shows the %s dialog wording for a cost of %s", (mode, cost, title, footer, button) => {
  expect(dialogWords(mode, cost)).toEqual({ title, footer, button });
});

it.each([
  [2.5, false, "2.5 days booked for Sam."],
  [1, true, "1 day booked for you."],
] as const)("confirms a %s-day booking with self %s", (cost, isSelf, expected) => {
  expect(bookedToast(cost, "Sam", isSelf)).toBe(expected);
});

it.each([
  [2.5, "2.5 days requested."],
  [1, "1 day requested."],
] as const)("confirms a request for %s days", (cost, expected) => {
  expect(requestedToast(cost)).toBe(expected);
});

it.each([
  {
    name: "shows a manager Request time off and Book for someone",
    viewerEmployeeId: "manager",
    people: [
      { id: "report", canCreate: "ALLOWED" },
      { id: "manager", canCreate: "ALLOWED_WITH_APPROVAL" },
      { id: "colleague", canCreate: "NOT_ALLOWED" },
    ],
    expected: { own: "request", forSomeone: true },
  },
  {
    name: "shows only Request time off to an employee who can request their own leave",
    viewerEmployeeId: "employee",
    people: [
      { id: "employee", canCreate: "ALLOWED_WITH_APPROVAL" },
      { id: "colleague", canCreate: "NOT_ALLOWED" },
    ],
    expected: { own: "request", forSomeone: false },
  },
  {
    name: "shows an admin Book time off and Book for someone",
    viewerEmployeeId: "admin",
    people: [
      { id: "admin", canCreate: "ALLOWED" },
      { id: "colleague", canCreate: "ALLOWED" },
    ],
    expected: { own: "book", forSomeone: true },
  },
  {
    name: "shows only Book for someone to a viewer without an employee who can book others",
    viewerEmployeeId: null,
    people: [{ id: "colleague", canCreate: "ALLOWED" }],
    expected: { own: null, forSomeone: true },
  },
  {
    name: "shows only Book time off when the viewer can book only their own leave",
    viewerEmployeeId: "employee",
    people: [
      { id: "colleague", canCreate: "NOT_ALLOWED" },
      { id: "employee", canCreate: "ALLOWED" },
    ],
    expected: { own: "book", forSomeone: false },
  },
] as const)("$name", ({ people, viewerEmployeeId, expected }) => {
  expect(headerButtons(people, viewerEmployeeId)).toEqual(expected);
});
