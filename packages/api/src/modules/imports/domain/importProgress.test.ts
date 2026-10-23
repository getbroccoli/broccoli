import { expect, it } from "vitest";

import { importProgress, type ImportSource } from ".";

it("reports a file being read and leaves the demo unavailable", () => {
  const source: ImportSource = {
    id: "file",
    kind: "file",
    name: "staff.csv",
    readAt: new Date("2026-10-01"),
    status: "mapping",
    failure: null,
    failureMessage: null,
    readBy: "parsed_by_broccoli",
    pickedUpByExternalAgentAt: null,
    originalReadAllowedAt: null,
    originalReadAiSource: null,
  };

  const progress = importProgress([source], 0);

  expect(progress).toEqual({ reading: true, demoAvailable: false });
});

it("leaves the demo unavailable when records have been gathered", () => {
  const source: ImportSource = {
    id: "slack",
    kind: "slack",
    name: "Acme Workspace",
    readAt: new Date("2026-10-01"),
    status: "mapped",
    failure: null,
    failureMessage: null,
    readBy: "parsed_by_broccoli",
    pickedUpByExternalAgentAt: null,
    originalReadAllowedAt: null,
    originalReadAiSource: null,
  };

  const progress = importProgress([source], 1);

  expect(progress).toEqual({ reading: false, demoAvailable: false });
});

it("leaves the demo available after a failed file without records", () => {
  const source: ImportSource = {
    id: "file",
    kind: "file",
    name: "staff.csv",
    readAt: new Date("2026-10-01"),
    status: "failed",
    failure: "unavailable",
    failureMessage: null,
    readBy: "parsed_by_broccoli",
    pickedUpByExternalAgentAt: null,
    originalReadAllowedAt: null,
    originalReadAiSource: null,
  };

  const progress = importProgress([source], 0);

  expect(progress).toEqual({ reading: false, demoAvailable: true });
});
