import { expect, it } from "vitest";

import { decisionLine, modeOf, recordedLine, statusLabel, waitingLine } from "./timeOffRequestText";

it.each([
  ["ALLOWED", "book"],
  ["ALLOWED_WITH_APPROVAL", "request"],
  ["NOT_ALLOWED", null],
] as const)("selects the person's time off action for %s", (permit, expected) => {
  expect(modeOf(permit)).toBe(expected);
});

it.each([
  ["REQUESTED", false, "Waiting for approval"],
  ["APPROVED", true, "Approved"],
  ["REJECTED", true, "Rejected"],
  ["CANCELLED", true, "Cancelled"],
  ["CANCELLED", false, "Ended with no decision"],
] as const)("labels %s with decision present %s as %s", (status, hasDecision, expected) => {
  expect(statusLabel(status, hasDecision)).toBe(expected);
});

it("shows when a request started waiting for approval", () => {
  expect(decisionLine("REQUESTED", null, requestedAt)).toBe(
    "Waiting for approval since Thu 26 Nov.",
  );
});

it("shows the London date for a request made after local midnight in summer", () => {
  expect(decisionLine("REQUESTED", null, "2026-07-01T23:30:00Z")).toBe(
    "Waiting for approval since Thu 2 Jul.",
  );
});

it("shows the London date for an approval made after local midnight in summer", () => {
  const approval = { decidedByName: "Rachel Doyle", decidedAt: "2026-07-01T23:30:00Z" };
  expect(decisionLine("APPROVED", approval, "2026-06-30T12:00:00Z")).toBe(
    "Approved by Rachel Doyle on Thu 2 Jul.",
  );
});

it.each([
  ["APPROVED", "Approved by Rachel Doyle on Fri 27 Nov."],
  ["REJECTED", "Rejected by Rachel Doyle on Fri 27 Nov."],
] as const)("shows who decided a %s request and when", (status, expected) => {
  expect(decisionLine(status, decision, requestedAt)).toBe(expected);
});

it("shows the approval date when the approver has been deleted", () => {
  expect(decisionLine("APPROVED", { ...decision, decidedByName: null }, requestedAt)).toBe(
    "Approved on Fri 27 Nov.",
  );
});

it("shows cancellation when an approved request is later cancelled", () => {
  expect(decisionLine("CANCELLED", decision, requestedAt)).toBe("Cancelled.");
});

it("shows when a request ended without a decision", () => {
  expect(decisionLine("CANCELLED", null, requestedAt)).toBe("Ended with no decision.");
});

it.each([
  [2.5, "2.5 days waiting for approval"],
  [0, null],
] as const)("shows a waiting line only for outstanding days (%s)", (days, expected) => {
  expect(waitingLine(days)).toBe(expected);
});

it.each([
  [0, "1 day recorded"],
  [1.5, "1 day recorded · 1.5 waiting"],
] as const)("shows recorded days with %s days waiting", (waiting, expected) => {
  expect(recordedLine(1, waiting)).toBe(expected);
});

const requestedAt = "2026-11-26T12:00:00Z";
const decision = { decidedByName: "Rachel Doyle", decidedAt: "2026-11-27T12:00:00Z" };
