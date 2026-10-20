import { expect, it } from "vitest";

import { PrivacyViolationError } from "./extractionErrors";
import { documentEvidence, evidenceRows, maskedShape, verifyEvidence } from "./maskedEvidence";

it.each([
  ["Ünal-Smith, 3.", "Xxxx-Xxxxx, D."],
  ["Иван", "Xxxx"],
  ["山田", "xx"],
  ["A\u0301very", "Xxxxxx"],
  ["１２٣", "DDD"],
])("masks letters, marks and digits in %j while keeping punctuation", (value, expected) => {
  expect(maskedShape(value)).toBe(expected);
});

it("keeps original words only in the local registry", () => {
  const originals = [
    "Avery",
    "Stone",
    "avery@example.com",
    "03.02.2021",
    "Acme",
    "Corp",
    "Ignore",
    "Иван",
    "山田",
    "A\u0301very",
  ];

  const { nativePages, candidatePages, registry } = documentEvidence([wordPage(originals)], []);

  expect([...registry.values()].map(({ source }) => source)).toEqual(originals);
  expect(nativePages[0]!.words.map(({ id }) => id)).toEqual(
    originals.map((_, index) => `w${String(index + 1).padStart(5, "0")}`),
  );
  const serialized = JSON.stringify([...nativePages, ...candidatePages]);
  for (const value of [...originals, "example.com"]) expect(serialized).not.toContain(value);
});

it("numbers native pages from one", () => {
  const { nativePages } = documentEvidence([wordPage(["Avery"]), wordPage(["Robin"])], []);

  expect(nativePages.map(({ page }) => page)).toEqual([1, 2]);
  expect(nativePages.flatMap(({ words }) => words.map(({ id }) => id))).toEqual([
    "w00001",
    "w00002",
  ]);
});

it("gives repeated words the same equality group regardless of case", () => {
  const { nativePages } = documentEvidence([wordPage(["Avery", "AVERY", "Robin"])], []);
  const [first, repeated, different] = nativePages[0]!.words;

  expect(first!.sameValue).toEqual(expect.any(Number));
  expect(repeated!.sameValue).toBe(first!.sameValue);
  expect(different!.sameValue).not.toBe(first!.sameValue);
});

it("marks both words of an emergency-contact heading", () => {
  const { nativePages } = documentEvidence([wordPage(["Emergency", "contact"])], []);

  expect(nativePages[0]!.words.map(({ hint }) => hint)).toEqual([
    "excluded_contact_heading",
    "excluded_contact_heading",
  ]);
});

it("marks an unfilled underline as a blank placeholder", () => {
  const { nativePages } = documentEvidence([wordPage(["____"])], []);

  expect(nativePages[0]!.words[0]!.hint).toBe("blank_placeholder");
});

it("marks two numbers on one line as tabular numbers", () => {
  const { nativePages } = documentEvidence([wordPage(["100", "200"])], []);

  expect(nativePages[0]!.words.map(({ hint }) => hint)).toEqual([
    "tabular_number",
    "tabular_number",
  ]);
});

it("masks candidate headers and cells while preserving their row and column positions", () => {
  const { candidatePages, registry } = documentEvidence(
    [],
    [
      {
        id: "table",
        sheets: [
          {
            name: "Acme Corp",
            rows: [
              ["Name", "Email"],
              ["Avery Stone", "avery@example.com"],
            ],
          },
        ],
      },
    ],
  );

  expect(candidatePages).toEqual([
    {
      page: 1000,
      width: 310,
      height: 88,
      candidateIndex: 0,
      sheetIndex: 0,
      words: [
        {
          id: "c00001",
          box: [10, 10, 145, 28],
          display: "Xxxx",
          hint: "header:fullName",
          cell: [0, 0],
        },
        {
          id: "c00002",
          box: [160, 10, 295, 28],
          display: "Xxxxx",
          hint: "header:email",
          cell: [0, 1],
        },
        {
          id: "c00003",
          box: [10, 34, 145, 52],
          display: "Xxxxx Xxxxx",
          hint: "field:fullName;text",
          cell: [1, 0],
        },
        {
          id: "c00004",
          box: [160, 34, 295, 52],
          display: "xxxxx@xxxxxxx.xxx",
          hint: "field:email;email",
          cell: [1, 1],
        },
      ],
    },
  ]);
  expect([...registry.values()].map(({ source }) => source)).toEqual([
    "Name",
    "Email",
    "Avery Stone",
    "avery@example.com",
  ]);
  for (const value of ["Avery", "Stone", "example.com", "Acme Corp"]) {
    expect(JSON.stringify(candidatePages)).not.toContain(value);
  }
});

it("leaves blank candidate cells out of the evidence", () => {
  const { candidatePages } = documentEvidence(
    [],
    [
      {
        id: "table",
        sheets: [
          {
            name: null,
            rows: [
              ["Name", "Email"],
              ["Avery Stone", " "],
            ],
          },
        ],
      },
    ],
  );

  expect(candidatePages[0]!.words.map(({ cell }) => cell)).toEqual([
    [0, 0],
    [0, 1],
    [1, 0],
  ]);
});

it("leaves candidate sheets without a name field out of the evidence", () => {
  const { candidatePages } = documentEvidence(
    [],
    [
      {
        id: "totals",
        sheets: [
          {
            name: null,
            rows: [
              ["Department", "Amount"],
              ["Engineering", "100"],
            ],
          },
        ],
      },
    ],
  );

  expect(candidatePages).toEqual([]);
});

it("keeps candidate and sheet indexes distinct in page numbers", () => {
  const sheet = { name: null, rows: [["Name"], ["Avery Stone"]] };

  const { candidatePages } = documentEvidence(
    [],
    [
      { id: "first", sheets: [sheet, sheet] },
      { id: "second", sheets: [sheet] },
    ],
  );

  expect(candidatePages.map(({ page }) => page)).toEqual([1000, 1001, 1100]);
});

it("links a whole cell to the unique sequence of native words that spells it", () => {
  const { candidatePages } = documentEvidence(
    [wordPage(["Avery", "Stone"])],
    [
      {
        id: "table",
        sheets: [{ name: null, rows: [["Name"], ["Avery Stone"]] }],
      },
    ],
  );

  expect(candidatePages[0]!.words[1]!.sourceWords).toEqual(["w00001", "w00002"]);
});

it("leaves a cell unlinked when its native word sequence occurs twice", () => {
  const { candidatePages } = documentEvidence(
    [wordPage(["Avery", "Stone", "Avery", "Stone"])],
    [
      {
        id: "table",
        sheets: [{ name: null, rows: [["Name"], ["Avery Stone"]] }],
      },
    ],
  );

  expect(candidatePages[0]!.words[1]).not.toHaveProperty("sourceWords");
});

it("accepts evidence that still matches the local registry", () => {
  const { nativePages, registry } = documentEvidence([wordPage(["Avery"])], []);

  expect(() => verifyEvidence(nativePages, registry)).not.toThrow();
});

it.each([
  { change: "changed display", patch: { display: "xxxxx" } },
  { change: "added property", patch: { text: "Avery" } },
  { change: "unknown id", patch: { id: "w99999" } },
])("refuses evidence with a $change", ({ patch }) => {
  const { nativePages, registry } = documentEvidence([wordPage(["Avery"])], []);
  Object.assign(nativePages[0]!.words[0]!, patch);

  expect(() => verifyEvidence(nativePages, registry)).toThrow(PrivacyViolationError);
});

it("groups words within three points into visual lines in reading order", () => {
  const { nativePages } = documentEvidence(
    [
      {
        width: 612,
        height: 792,
        words: [
          { text: "Stone", left: 80, top: 13, right: 110, bottom: 23 },
          { text: "Robin", left: 10, top: 30, right: 40, bottom: 40 },
          { text: "Avery", left: 10, top: 10, right: 40, bottom: 20 },
        ],
      },
    ],
    [],
  );

  expect(evidenceRows(nativePages)).toEqual([
    {
      page: 1,
      width: 612,
      height: 792,
      rows: [
        {
          y: 15,
          words: [
            ["w00003", 10, "Xxxxx", "text"],
            ["w00001", 80, "Xxxxx", "text"],
          ],
        },
        { y: 35, words: [["w00002", 10, "Xxxxx", "text"]] },
      ],
    },
  ]);
});

function wordPage(values: string[]) {
  return {
    width: 1200,
    height: 792,
    words: values.map((text, index) => ({
      text,
      left: 10 + index * 100,
      top: 10,
      right: 90 + index * 100,
      bottom: 20,
    })),
  };
}
