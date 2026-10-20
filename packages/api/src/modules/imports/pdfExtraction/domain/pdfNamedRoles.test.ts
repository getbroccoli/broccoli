import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfNamedRoles } from "./pdfNamedRoles";

it("moves role suffixes out of comma-name cells and keeps other fields", () => {
  const candidate = pdfNamedRoles([
    page([
      line(740, ["Name", "Department", "Email"]),
      line(700, ["Stone, Avery, Department Chair", "Sociology", "avery@example.test"]),
      line(660, ["Reed, Robin", "Anthropology", "robin@example.test"]),
      line(620, ["Lee, Sam, Jr.", "History", "sam@example.test"]),
    ]),
  ]);

  expect(candidate?.sheets[0]?.rows).toEqual([
    ["Name", "Department", "Email", "Job title"],
    ["Stone, Avery", "Sociology", "avery@example.test", "Department Chair"],
    ["Reed, Robin", "Anthropology", "robin@example.test", ""],
    ["Lee, Sam, Jr.", "History", "sam@example.test", ""],
  ]);
});

it("preserves multi-comma names that do not have a recognizable role suffix", () => {
  const candidate = pdfNamedRoles([
    page([
      line(740, ["Name", "Department", "Email"]),
      line(700, ["Stone, Avery, Jr.", "Sociology", "avery@example.test"]),
      line(660, ["Reed, Robin, Ph.D.", "Anthropology", "robin@example.test"]),
    ]),
  ]);

  expect(candidate).toBeNull();
});
