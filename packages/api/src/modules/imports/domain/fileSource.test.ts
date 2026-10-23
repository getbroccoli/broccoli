import { expect, it } from "vitest";

import { FileSource, type FileSourceState } from ".";

it("finishes the current attempt and leaves the original snapshot unchanged", () => {
  const source = exampleFileSource();

  const finished = source.finishMapping(4, {
    status: "failed",
    failure: "unavailable",
    failureMessage: "Provider unavailable",
  });

  expect(finished).toMatchObject({
    status: "failed",
    failure: "unavailable",
    failureMessage: "Provider unavailable",
    mappingAttempt: 4,
  });
  expect(source.status).toBe("mapping");
});

it.each([3, 5])("ignores a result for attempt %s when the current attempt is 4", (attempt) => {
  const source = exampleFileSource();

  expect(source.finishMapping(attempt, { status: "mapped" })).toBeNull();
});

it("ignores a duplicate result after a run has finished", () => {
  const source = exampleFileSource({ status: "mapped" });

  expect(source.finishMapping(4, { status: "failed", failure: "unavailable" })).toBeNull();
});

it("retry clears the failure, starts the next attempt, and a successful result stays clear", () => {
  const source = exampleFileSource({
    status: "failed",
    failure: "unavailable",
    failureMessage: "Provider unavailable",
  });

  const retried = source.restartMapping();
  const finished = retried?.finishMapping(5, { status: "mapped" });

  expect(retried).toMatchObject({
    status: "mapping",
    mappingAttempt: 5,
    failure: null,
    failureMessage: null,
  });
  expect(finished).toMatchObject({ status: "mapped", failure: null, failureMessage: null });
  expect(source.status).toBe("failed");
});

it("retry replaces pending external-agent answers with a model mapping", () => {
  const source = exampleFileSource({ readBy: "answered_by_external_agent" });

  expect(source.restartMapping()).toMatchObject({
    status: "mapping",
    readBy: "parsed_by_broccoli",
    mappingAttempt: 5,
  });
});

it.each(["mapping", "mapped", "waiting_for_original_read_consent"] as const)(
  "does not retry a model source with status %s",
  (status) => {
    expect(exampleFileSource({ status }).restartMapping()).toBeNull();
  },
);

it("does not replace an original read with a masked mapping retry", () => {
  const source = exampleFileSource({
    status: "failed",
    failure: "unavailable",
    originalReadAllowedAt: new Date("2026-10-01"),
  });

  expect(source.restartMapping()).toBeNull();
});

it("an original-read job requires consent as well as the current attempt", () => {
  const source = exampleFileSource();
  const consented = exampleFileSource({ originalReadAllowedAt: new Date("2026-10-01") });

  expect(source.isCurrentOriginalRead(4)).toBe(false);
  expect(consented.isCurrentOriginalRead(4)).toBe(true);
  expect(consented.isCurrentOriginalRead(3)).toBe(false);
});

function exampleFileSource(state: Partial<FileSourceState> = {}): FileSource {
  return new FileSource({
    id: "source",
    kind: "file",
    name: "staff.csv",
    fileId: "file",
    mappingAttempt: 4,
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
