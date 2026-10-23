import { expect, it } from "vitest";

import { ImportSource, type ImportSourceState } from ".";

it.each([
  { status: "failed", failure: null },
  { status: "mapped", failure: "unavailable" },
  { status: "mapping", failure: "unavailable" },
] as const)("refuses a source whose status and failure disagree: %j", (state) => {
  expect(() => exampleSource(state)).toThrow(
    "A source has a failure reason exactly when its status is failed",
  );
});

it("selects masked questions or original-file work from the owner's consent", () => {
  const source = exampleSource({ readBy: "answered_by_external_agent" });
  const consented = exampleSource({
    readBy: "answered_by_external_agent",
    originalReadAllowedAt: new Date("2026-10-01"),
  });

  expect(source.externalAgentWork()).toBe("answer_masked_questions");
  expect(consented.externalAgentWork()).toBe("read_original_file");
  expect(exampleSource().externalAgentWork()).toBeNull();
  expect(
    exampleSource({ readBy: "answered_by_external_agent", status: "mapped" }).externalAgentWork(),
  ).toBeNull();
});

it("requires fresh consent to switch a pending agent original read to the model", () => {
  const source = exampleSource({
    readBy: "answered_by_external_agent",
    originalReadAllowedAt: new Date("2026-10-01"),
  });

  expect(() => source.requireAllowOriginalRead("broccoli_ai")).not.toThrow();
  expect(() => source.requireAllowOriginalRead("external_agent")).toThrow(
    "Wait until the file is read.",
  );
});

it("permits a failed original read to be consented again", () => {
  const source = exampleSource({
    status: "failed",
    failure: "unavailable",
    originalReadAllowedAt: new Date("2026-10-01"),
  });

  expect(() => source.requireAllowOriginalRead("broccoli_ai")).not.toThrow();
});

it("refuses repeated consent for a successful original read", () => {
  const source = exampleSource({ status: "mapped", originalReadAllowedAt: new Date("2026-10-01") });

  expect(() => source.requireAllowOriginalRead("broccoli_ai")).toThrow(
    "AI may already read this file.",
  );
});

it("copies the supplied state and does not expose mutable stored dates", () => {
  const readAt = new Date("2026-10-01");
  const source = exampleSource({ readAt });

  readAt.setUTCFullYear(2030);
  source.readAt.setUTCFullYear(2030);

  expect(source.readAt).toEqual(new Date("2026-10-01"));
});

function exampleSource(state: Partial<ImportSourceState> = {}): ImportSource {
  return new ImportSource({
    id: "source",
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
    ...state,
  });
}
