import { expect, it } from "vitest";

import { InvalidModelOutputError } from "./extractionErrors";
import { documentEvidence } from "./maskedEvidence";
import { selectedRows } from "./rowSelection";

it("restores complete cells with their reference draft and source position", () => {
  const { candidatePages, registry } = documentEvidence([], [candidate]);
  const position = { candidate: 0, sheet: 0, row: 1 };

  expect(selectedRows({ rows: [position] }, candidatePages, registry)).toEqual([
    {
      position,
      source: {
        name: "Stone, Avery",
        firstName: null,
        lastName: null,
        email: "avery@example.com",
        jobTitle: "Payroll Specialist",
        startDate: "03.02.2021",
        nameSource: "combined",
        dateOrder: "dmy",
      },
      draft: {
        name: ["c00006"],
        firstName: [],
        lastName: [],
        email: ["c00007"],
        jobTitle: ["c00008"],
        startDate: ["c00009"],
        nameSource: "combined",
        dateOrder: "dmy",
      },
    },
  ]);
});

it.each([
  { candidate: 1, sheet: 0, row: 1 },
  { candidate: 0, sheet: 1, row: 1 },
  { candidate: 0, sheet: 0, row: 99 },
  { candidate: 0, sheet: 0, row: -1 },
  { candidate: 0, sheet: 0, row: 1.5 },
])("rejects an unknown or invalid row position %j", (position) => {
  const { candidatePages, registry } = documentEvidence([], [candidate]);

  expect(() => selectedRows({ rows: [position] }, candidatePages, registry)).toThrow(
    InvalidModelOutputError,
  );
});

it("rejects selection of the header row", () => {
  const { candidatePages, registry } = documentEvidence([], [candidate]);

  expect(() =>
    selectedRows({ rows: [{ candidate: 0, sheet: 0, row: 0 }] }, candidatePages, registry),
  ).toThrow(InvalidModelOutputError);
});

it("rejects a row selected twice", () => {
  const { candidatePages, registry } = documentEvidence([], [candidate]);
  const position = { candidate: 0, sheet: 0, row: 1 };

  expect(() => selectedRows({ rows: [position, position] }, candidatePages, registry)).toThrow(
    InvalidModelOutputError,
  );
});

it("rejects rows selected from two alternative candidates", () => {
  const { candidatePages, registry } = documentEvidence([], [candidate, candidate]);

  expect(() =>
    selectedRows(
      {
        rows: [
          { candidate: 0, sheet: 0, row: 1 },
          { candidate: 1, sheet: 0, row: 1 },
        ],
      },
      candidatePages,
      registry,
    ),
  ).toThrow(InvalidModelOutputError);
});

it("rejects a selected row without a populated name cell", () => {
  const { candidatePages, registry } = documentEvidence([], [candidate]);

  expect(() =>
    selectedRows({ rows: [{ candidate: 0, sheet: 0, row: 3 }] }, candidatePages, registry),
  ).toThrow(InvalidModelOutputError);
});

it("leaves an emergency contact row out of the restored records", () => {
  const { candidatePages, registry } = documentEvidence([], [candidate]);

  expect(
    selectedRows({ rows: [{ candidate: 0, sheet: 0, row: 2 }] }, candidatePages, registry),
  ).toEqual([]);
});

it("returns no records for an empty selection", () => {
  const { candidatePages, registry } = documentEvidence([], [candidate]);

  expect(selectedRows({ rows: [] }, candidatePages, registry)).toEqual([]);
});

it.each([
  ["13/02/2021", "dmy"],
  ["02/13/2021", "mdy"],
])("fills an unresolved date order from the selected date %s", (date, order) => {
  const layout = structuredClone(candidate);
  layout.sheets[0]!.rows[1]![3] = date;
  const { candidatePages, registry } = documentEvidence([], [layout]);

  const rows = selectedRows(
    {
      rows: [
        { candidate: 0, sheet: 0, row: 1 },
        { candidate: 0, sheet: 0, row: 4 },
      ],
    },
    candidatePages,
    registry,
  );

  expect(rows.map(({ source, draft }) => [source.dateOrder, draft.dateOrder])).toEqual([
    [order, order],
    [order, order],
  ]);
});

const candidate = {
  id: "table",
  sheets: [
    {
      name: null,
      rows: [
        ["Name", "Email", "Role", "Hire date", "Section"],
        [
          "Stone, Avery",
          "avery@example.com",
          "Payroll Specialist",
          "03.02.2021",
          "Employee information",
        ],
        ["Robin Reed", "", "Engineer", "", "Emergency contact"],
        ["", "", "Engineer", "", ""],
        ["Morgan Lake", "", "Designer", "02/03/2021", ""],
      ],
    },
  ],
};
