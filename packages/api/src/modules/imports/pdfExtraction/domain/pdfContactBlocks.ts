import { keptByPlaceholders } from "../../../../integrations/ai";
import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { pageLines } from "./pdfLines";
import { knownColumnMapping } from "./layoutSheet";

/** Named telephone contacts embedded in role descriptions, with explicit role labels. */
export function pdfContactBlocks(pages: PdfPage[]): PdfCandidate | null {
  const lines = pageLines(pages);
  const rows = lines.flatMap((line, index) =>
    line.cells.flatMap((cell, column) => {
      const phone = PHONE.exec(cell.text);
      if (!phone) return [];
      const inline = cell.text.slice(0, phone.index).trim();
      const name =
        inline || line.cells.slice(0, column).findLast(({ text }) => personName(text))?.text;
      if (!name || !personName(name)) return [];
      const label = line.cells.find(({ text }) => /^(?:Leitung|Head|Director):$/iu.test(text));
      let role: string;
      if (label) {
        const prefix = label.text.slice(0, -1);
        const following = lines.slice(index + 1, index + 5);
        const nextContact = following.findIndex(({ cells }) =>
          cells.some(({ text }) => PHONE.test(text)),
        );
        role =
          following
            .slice(0, nextContact < 0 ? undefined : nextContact)
            .filter((below) => below.page === line.page && line.y - below.y <= cell.tolerance * 8)
            .flatMap(({ cells }) => cells)
            .find(
              ({ text, x }) =>
                text.startsWith(`${prefix} `) && Math.abs(x - label.x) <= label.tolerance,
            )?.text ?? prefix;
      } else {
        const preceding = lines.slice(Math.max(0, index - 4), index);
        const previousContact = preceding.findLastIndex(({ cells }) =>
          cells.some(({ text }) => PHONE.test(text)),
        );
        role =
          preceding
            .slice(previousContact + 1)
            .filter((above) => above.page === line.page && above.y - line.y <= cell.tolerance * 8)
            .flatMap(({ cells }) => cells)
            .findLast(({ text, x }) => ROLE.test(text) && Math.abs(x - cell.x) <= cell.tolerance)
            ?.text ?? "";
      }
      return [[name, role]];
    }),
  );
  return rows.length === 0 || !rows.some((row) => row[1])
    ? null
    : {
        id: "contactBlocks",

        sheets: [
          {
            name: null,
            rows: [["Name", "Job title"], ...rows],
            knownMapping: knownColumnMapping({ fullName: 0, jobTitle: 1 }),
          },
        ],
      };
}

const PHONE = /(?:tel(?:ephone|efon)?\.?|phone)\s*:\s*[+()\d /-]+/iu;
const ROLE =
  /^(?:[\p{L}\p{M}-]*(?:sprecher(?:in)?|referent(?:in)?|beauftragte[rn]?|leiter(?:in)?)|(?:Deputy |Assistant )?(?:Director|Manager|Coordinator|Spokesperson))$/iu;

function personName(text: string): boolean {
  const words = text.split(/\s+/u);
  return (
    words.length >= 2 &&
    words.length <= 5 &&
    /^[\p{L}\p{M} .’'-]+$/u.test(text) &&
    words.filter((word) => /^\p{Lu}/u.test(word)).length >= 2 &&
    !/\b(?:office|department|unit|division|center|centre|administration)$/iu.test(text) &&
    !keptByPlaceholders(text)
  );
}
