import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { pdfSheets } from "./pdfSheets";

/** Moves a recognizable role suffix out of a name cell without changing other table values. */
export function pdfNamedRoles(pages: PdfPage[]): PdfCandidate | null {
  const sheets = pdfSheets(pages);
  if (sheets === null) return null;

  let foundRole = false;
  const rows = sheets.map(({ name, rows }) => {
    const [header, ...records] = rows;
    const nameColumn = header?.findIndex((cell) => NAME_HEADER.test(cell)) ?? -1;
    const hasEmail = header?.some((cell) => EMAIL_HEADER.test(cell)) ?? false;
    if (nameColumn < 0 || !hasEmail || header?.some((cell) => TITLE_HEADER.test(cell))) {
      return { name, rows };
    }

    return {
      name,
      rows: [
        [...header!, "Job title"],
        ...records.map((record) => {
          const parts = record[nameColumn]?.split(",").map((part) => part.trim()) ?? [];
          const role = parts.length === 3 && ROLE.test(parts[2]!) ? parts.pop()! : "";
          if (role) foundRole = true;
          return [...record, role].map((cell, index) =>
            index === nameColumn && role ? parts.join(", ") : cell,
          );
        }),
      ],
    };
  });

  return foundRole
    ? {
        id: "named-roles",

        sheets: rows,
      }
    : null;
}

const NAME_HEADER = /\b(?:name|faculty)\b/iu;
const EMAIL_HEADER = /e-?mail/iu;
const TITLE_HEADER = /\b(?:job\s*title|position|role)\b/iu;
const ROLE =
  /\b(?:chair|professor|lecturer|instructor|dean|director|coordinator|assistant|associate|researcher|faculty|administrator|specialist|manager|head)\b/iu;
