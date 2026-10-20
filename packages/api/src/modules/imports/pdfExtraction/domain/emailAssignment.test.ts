import { expect, it } from "vitest";

import { unusedEmailIds, withAssignedEmails } from "./emailAssignment";
import { InvalidModelOutputError } from "./extractionErrors";
import { documentEvidence } from "./maskedEvidence";
import type { SourceRecord } from "./pdfNormalization";

it("offers only complete native emails that no record already uses", () => {
  const { registry } = emailEvidence();
  const sources = unassignedSources();
  sources[0]!.email = "AVERY@EXAMPLE.COM";

  expect(unusedEmailIds(registry, sources)).toEqual(new Set(["w00002"]));
});

it("assigns an allowed native email to a row that has none", () => {
  const { registry } = emailEvidence();
  const sources = unassignedSources();
  const output = { assignments: [{ row: 0, emailIds: ["w00001"] }] };

  expect(withAssignedEmails(sources, output, registry, new Set(["w00001"]))).toEqual([
    { ...sources[0], email: "avery@example.com" },
    sources[1],
  ]);
  expect(sources[0]!.email).toBeNull();
});

it("leaves the records unchanged for an empty assignment", () => {
  const { registry } = emailEvidence();
  const sources = unassignedSources();

  expect(withAssignedEmails(sources, { assignments: [] }, registry, new Set())).toEqual(sources);
});

it.each([-1, 2, 0.5])("rejects an email assignment to the invalid row %s", (row) => {
  const { registry } = emailEvidence();

  expect(() =>
    withAssignedEmails(
      unassignedSources(),
      { assignments: [{ row, emailIds: ["w00001"] }] },
      registry,
      new Set(["w00001"]),
    ),
  ).toThrow(InvalidModelOutputError);
});

it("rejects two email assignments to the same row", () => {
  const { registry } = emailEvidence();
  const output = {
    assignments: [
      { row: 0, emailIds: ["w00001"] },
      { row: 0, emailIds: ["w00002"] },
    ],
  };

  expect(() =>
    withAssignedEmails(unassignedSources(), output, registry, new Set(["w00001", "w00002"])),
  ).toThrow(InvalidModelOutputError);
});

it("rejects an assignment that overwrites a valid email", () => {
  const { registry } = emailEvidence();
  const sources = unassignedSources();
  sources[0]!.email = "avery@work.example";

  expect(() =>
    withAssignedEmails(
      sources,
      { assignments: [{ row: 0, emailIds: ["w00001"] }] },
      registry,
      new Set(["w00001"]),
    ),
  ).toThrow(InvalidModelOutputError);
});

it("rejects an email id outside the allowed unused references", () => {
  const { registry } = emailEvidence();

  expect(() =>
    withAssignedEmails(
      unassignedSources(),
      { assignments: [{ row: 0, emailIds: ["w00002"] }] },
      registry,
      new Set(["w00001"]),
    ),
  ).toThrow(InvalidModelOutputError);
});

it("rejects reuse of the same email id for two different rows", () => {
  const { registry } = emailEvidence();
  const output = {
    assignments: [
      { row: 0, emailIds: ["w00001"] },
      { row: 1, emailIds: ["w00001"] },
    ],
  };

  expect(() =>
    withAssignedEmails(unassignedSources(), output, registry, new Set(["w00001"])),
  ).toThrow(InvalidModelOutputError);
});

it("rejects references that do not join to a complete address", () => {
  const { registry } = emailEvidence();

  expect(() =>
    withAssignedEmails(
      unassignedSources(),
      { assignments: [{ row: 0, emailIds: ["w00003"] }] },
      registry,
      new Set(["w00003"]),
    ),
  ).toThrow(InvalidModelOutputError);
});

it("rejects an email id repeated within one assignment", () => {
  const { registry } = emailEvidence();

  expect(() =>
    withAssignedEmails(
      unassignedSources(),
      { assignments: [{ row: 0, emailIds: ["w00001", "w00001"] }] },
      registry,
      new Set(["w00001"]),
    ),
  ).toThrow(InvalidModelOutputError);
});

function unassignedSources(): SourceRecord[] {
  return ["Avery Stone", "Robin Reed"].map((name) => ({
    name,
    firstName: null,
    lastName: null,
    email: null,
    jobTitle: null,
    startDate: null,
    nameSource: "combined",
    dateOrder: null,
  }));
}

function emailEvidence() {
  return documentEvidence(
    [
      {
        width: 612,
        height: 792,
        words: [
          { text: "avery@example.com", left: 40, top: 20, right: 140, bottom: 30 },
          { text: "robin@example.com", left: 40, top: 40, right: 140, bottom: 50 },
          { text: "avery@", left: 40, top: 60, right: 80, bottom: 70 },
        ],
      },
    ],
    [
      {
        id: "table",
        sheets: [
          {
            name: null,
            rows: [
              ["Name", "Email"],
              ["Robin Reed", "robin@example.com"],
            ],
          },
        ],
      },
    ],
  );
}
