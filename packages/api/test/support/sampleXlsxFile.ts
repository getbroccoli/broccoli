import { strToU8, zipSync } from "fflate";

type Cell =
  | string
  | number
  | boolean
  | null
  | { date: string }
  | { formula: string; value?: string | number | boolean; error?: string };

type Sheet = { name: string; hidden?: "hidden" | "veryHidden" } & (
  { rows: Cell[][] } | { xml: string }
);

/** A minimal workbook with real cell types and saved formula values. */
export function sampleXlsxFile({ sheets }: { sheets: Sheet[] }): Uint8Array {
  const strings: string[] = [];
  const entries: Record<string, Uint8Array> = {};
  const worksheetTypes: string[] = [];
  const relationships: string[] = [];
  const sheetNames: string[] = [];

  sheets.forEach((sheet, index) => {
    const id = index + 1;
    entries[`xl/worksheets/sheet${id}.xml`] = strToU8(
      "xml" in sheet
        ? sheet.xml
        : `<worksheet xmlns="${SPREADSHEET}"><sheetData>${sheet.rows
            .map(
              (row, rowIndex) =>
                `<row r="${rowIndex + 1}">${row
                  .map((cell, column) =>
                    cellXml(cell, `${columnName(column)}${rowIndex + 1}`, strings),
                  )
                  .join("")}</row>`,
            )
            .join("")}</sheetData></worksheet>`,
    );
    sheetNames.push(
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${id}" r:id="rId${id}"${sheet.hidden ? ` state="${sheet.hidden}"` : ""}/>`,
    );
    relationships.push(
      `<Relationship Id="rId${id}" Type="${DOCUMENT_RELS}/worksheet" Target="worksheets/sheet${id}.xml"/>`,
    );
    worksheetTypes.push(
      `<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
  });

  entries["[Content_Types].xml"] = strToU8(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${worksheetTypes.join("")}</Types>`,
  );
  entries["_rels/.rels"] = strToU8(
    `<Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${DOCUMENT_RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  entries["xl/workbook.xml"] = strToU8(
    `<workbook xmlns="${SPREADSHEET}" xmlns:r="${DOCUMENT_RELS}"><sheets>${sheetNames.join("")}</sheets></workbook>`,
  );
  entries["xl/_rels/workbook.xml.rels"] = strToU8(
    `<Relationships xmlns="${PACKAGE_RELS}">${relationships.join("")}<Relationship Id="styles" Type="${DOCUMENT_RELS}/styles" Target="styles.xml"/><Relationship Id="strings" Type="${DOCUMENT_RELS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  entries["xl/sharedStrings.xml"] = strToU8(
    `<sst xmlns="${SPREADSHEET}">${strings.map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`).join("")}</sst>`,
  );
  entries["xl/styles.xml"] = strToU8(
    `<styleSheet xmlns="${SPREADSHEET}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  );
  return zipSync(entries);
}

/** A tiny workbook whose distant value keeps the reader busy until it runs out of memory. */
export function xlsxFileWithDistantCell(): Uint8Array {
  return sampleXlsxFile({
    sheets: [
      {
        name: "Staff",
        xml: `<worksheet xmlns="${SPREADSHEET}"><sheetData><row r="1000000"><c r="XFD1000000"><v>1</v></c></row></sheetData></worksheet>`,
      },
    ],
  });
}

const SPREADSHEET = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const DOCUMENT_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";

function cellXml(cell: Cell, reference: string, strings: string[]): string {
  if (cell === null) return `<c r="${reference}"/>`;
  if (typeof cell === "string") {
    strings.push(cell);
    return `<c r="${reference}" t="s"><v>${strings.length - 1}</v></c>`;
  }
  if (typeof cell === "number" || typeof cell === "boolean") {
    return `<c r="${reference}" t="${typeof cell === "boolean" ? "b" : "n"}"><v>${Number(cell)}</v></c>`;
  }
  if ("date" in cell) {
    const serial = (Date.parse(cell.date) - Date.UTC(1899, 11, 30)) / 86_400_000;
    return `<c r="${reference}" s="1"><v>${serial}</v></c>`;
  }
  const type = cell.error
    ? "e"
    : typeof cell.value === "string"
      ? "str"
      : typeof cell.value === "boolean"
        ? "b"
        : "n";
  const value = cell.error ?? (typeof cell.value === "boolean" ? Number(cell.value) : cell.value);
  return `<c r="${reference}" t="${type}"><f>${escapeXml(cell.formula)}</f>${value === undefined ? "" : `<v>${escapeXml(String(value))}</v>`}</c>`;
}

function columnName(index: number): string {
  let name = "";
  for (let column = index + 1; column > 0; column = Math.floor((column - 1) / 26)) {
    name = String.fromCharCode(65 + ((column - 1) % 26)) + name;
  }
  return name;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
