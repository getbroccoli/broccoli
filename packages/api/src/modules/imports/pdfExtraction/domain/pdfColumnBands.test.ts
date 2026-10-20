import { expect, it } from "vitest";
import { page } from "#test/support";
import type { PdfTextItem } from "../../../../utils";
import { pdfColumnBands } from "./pdfColumnBands";

it("reads wrapped centered person headings without joining unkeyed contact bands", () => {
  const candidate = pdfColumnBands([page([bands()])]);

  expect(candidate?.sheets[0]?.rows).toEqual([
    ["First name", "Last name", "Job title", "Work email", "Start date"],
    ["Avery", "Stone Reed", "Director", "", ""],
    ["Robin", "Park", "Engineer", "", ""],
  ]);
});

it("ignores independent contact sections regardless of their row counts or labels", () => {
  const missing = bands().filter(({ y }) => y !== 580);
  const unrelated = bands().map((cell) =>
    cell.text === "Correo electrónico" ? { ...cell, text: "First name" } : cell,
  );
  for (const items of [missing, unrelated]) {
    const rows = pdfColumnBands([page([items])])?.sheets[0]?.rows;
    expect(rows).toHaveLength(3);
    expect(rows?.slice(1).map((row) => row[3])).toEqual(["", ""]);
  }
});

function bands(): PdfTextItem[] {
  return [
    cell(300, 740, "Table columns"),
    cell(80, 720, "Nombre"),
    cell(200, 724, "Primer apellido"),
    cell(200, 716, "del empleado"),
    cell(320, 720, "Segundo apellido"),
    cell(440, 720, "Job title"),
    ...row(700, ["Avery", "Stone", "Reed", "Director"]),
    ...row(680, ["Robin", "Park", "", "Engineer"]),
    cell(300, 640, "Table columns"),
    cell(80, 624, "Correo electrónico"),
    cell(80, 616, "oficial"),
    cell(200, 620, "Extension"),
    ...row(600, ["avery@example.test", "100"]),
    ...row(580, ["", "101"]),
  ];
}

function row(y: number, values: string[]): PdfTextItem[] {
  return values.flatMap((text, index) => (text ? [cell(80 + index * 120, y, text)] : []));
}

function cell(center: number, y: number, text: string): PdfTextItem {
  const width = text.length * 3;
  return { text, x: center - width / 2, y, width, height: 6 };
}
