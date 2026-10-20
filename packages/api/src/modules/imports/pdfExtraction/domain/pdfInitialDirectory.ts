import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { pageLines } from "./pdfLines";
import { knownColumnMapping } from "./layoutSheet";

/** Reads compact parallel phone entries where surnames end in a given-name initial. */
export function pdfInitialDirectory(pages: PdfPage[]): PdfCandidate | null {
  const entries = pageLines(pages).flatMap(({ cells }) =>
    cells.flatMap((cell, index) => {
      const entry = parseEntry(cell.text);
      if (!entry) return [];
      const extension = entry[1] || numberAt(cells[index + 1]?.text ?? "");
      return [[entry[0], extension]];
    }),
  );
  return entries.length < 2
    ? null
    : {
        id: "initialDirectory",

        sheets: [
          {
            name: null,
            rows: [["Name", "Phone extension"], ...entries],
            knownMapping: knownColumnMapping({ fullName: 0 }),
          },
        ],
      };
}

function parseEntry(text: string): [name: string, extension: string] | null {
  const extension = numberAt(text);
  const name = cleanName(extension ? text.slice(0, -extension.length).trim() : text);
  return name ? [name, extension] : null;
}

function cleanName(text: string): string | null {
  const words = text.split(/\s+/u).filter(Boolean);
  while (words.length > 0 && isPrefix(words[0]!)) words.shift();
  if (words.length >= 3 && /^[\p{Lu}]$/u.test(words[0]!)) words.shift();
  const name = words.join(" ");
  return /^(?:[\p{Lu}\p{M}'’.-]+\s+)+[\p{Lu}]\.?$/u.test(name) ? name : null;
}

function isPrefix(word: string): boolean {
  return (
    /^\d{1,3}[\p{Lu}]?$/u.test(word) ||
    /^RM\.?\d+(?:\.\d+)*[\p{Lu}]?$/iu.test(word) ||
    /^[\p{Lu}]{2,}\.?\d+(?:\.\d+)+[\p{Lu}]?$/u.test(word)
  );
}

function numberAt(text: string): string {
  return /(?:^|\s|(?<=\.))(\d{3,6})$/u.exec(text)?.[1] ?? "";
}
