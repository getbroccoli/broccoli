import { keptByPlaceholders } from "../../../../integrations/ai";
import type { PdfPage } from "../../../../utils";
import { isDirectlyBelow, pageLines } from "./pdfLines";
import { pdfContactBlocks } from "./pdfContactBlocks";
import { pdfPhoneDirectory } from "./pdfPhoneDirectory";
import { pdfForms } from "./pdfForms";
import { pdfDirectories } from "./pdfDirectories";
import { pdfNumberedPeople } from "./pdfNumberedPeople";
import { pdfNamedRoles } from "./pdfNamedRoles";
import { pdfInitialDirectory } from "./pdfInitialDirectory";
import { pdfLeaderTable } from "./pdfLeaderTable";
import { pdfColumnBands } from "./pdfColumnBands";
import { knownColumnMapping, type LayoutSheet } from "./layoutSheet";

/** A layout of the PDF reconstructed in code; several may describe the same people. */
export interface PdfCandidate {
  id: string;
  sheets: LayoutSheet[];
}

/** Every layout the builders other than the table reader find in the pages. */
export function pdfCandidates(pages: PdfPage[]): PdfCandidate[] {
  return [
    dotLeaderPeople(pages),
    pdfNumberedPeople(pages),
    ...pdfDirectories(pages),
    ...pdfForms(pages),
    pdfPhoneDirectory(pages),
    pdfContactBlocks(pages),
    pdfNamedRoles(pages),
    pdfInitialDirectory(pages),
    pdfLeaderTable(pages),
    pdfColumnBands(pages),
  ].filter((candidate) => candidate !== null);
}

function dotLeaderPeople(pages: PdfPage[]): PdfCandidate | null {
  const lines = pageLines(pages);
  const rows = lines.flatMap((line, index) =>
    line.cells.flatMap(({ text, x }) => {
      const parts = text.split(/\s*\.{3,}\s*/u);
      if (
        parts.length !== 2 ||
        !parts.every(Boolean) ||
        !looksLikeName(parts[0]!) ||
        !/^[+()\d\s-]+$/u.test(parts[1]!)
      )
        return [];
      const next = lines[index + 1];
      const title =
        next?.page === line.page && isDirectlyBelow(next, line.y)
          ? (next.cells.find((cell) => Math.abs(cell.x - x) < cell.tolerance)?.text ?? "")
          : "";
      const hasRoleWord = title.split(/\s+/u).some(keptByPlaceholders);
      return [[...parts, /[\d:]|\.{3}/u.test(title) || !hasRoleWord ? "" : title]];
    }),
  );
  return rows.length === 0
    ? null
    : {
        id: "leaders",
        sheets: [
          {
            name: null,
            rows: [["Name", "Phone", "Job title"], ...rows],
            knownMapping: knownColumnMapping({ fullName: 0, jobTitle: 2 }),
          },
        ],
      };
}

function looksLikeName(text: string): boolean {
  return !/[\d:()]/u.test(text) && (text.match(/\p{L}+/gu)?.length ?? 0) >= 2;
}
