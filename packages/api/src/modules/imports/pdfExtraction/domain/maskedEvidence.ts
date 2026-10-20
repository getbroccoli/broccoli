import { isDeepStrictEqual } from "node:util";

import type { MaskedPage, MaskedRowsPage, MaskedWord } from "../../../../integrations/ai";
import type { PdfWordPage } from "../../../../utils";
import { columnFields, contextHint, isNameField } from "./candidateFields";
import { PrivacyViolationError } from "./extractionErrors";
import type { PdfCandidate } from "./pdfCandidates";
import { casefold } from "./casefold";
import { phraseHints } from "./phraseHints";
import { centre, roundHalfEven, visualLines } from "./visualLines";
import { wordHint } from "./wordHint";

/** A masked word and the original it stands for, which never leaves the instance. */
export interface RegisteredWord {
  source: string;
  masked: MaskedWord;
  /** The native page, or the candidate sheet's page. */
  page: number;
}

/** Everything the model may see of one PDF, and the originals behind it. */
export interface DocumentEvidence {
  /** The native words, page by page (`page` 1, 2, …), ids `w00001`… */
  nativePages: MaskedPage[];
  /** One page per candidate sheet with a name field, `page` 1000 + 100·candidate + sheet, ids `c00001`… */
  candidatePages: MaskedPage[];
  registry: ReadonlyMap<string, RegisteredWord>;
}

/**
 * Masks the native words and the candidates' cells: each becomes an id, its box, its shape and a
 * generic category; repeated words share an equality group. The registry keeps the originals.
 */
export function documentEvidence(
  wordPages: PdfWordPage[],
  candidates: PdfCandidate[],
): DocumentEvidence {
  const registry = new Map<string, RegisteredWord>();
  const nativePages = maskedNativePages(wordPages, registry);
  const candidatePages = maskedCandidatePages(candidates, registry);
  return { nativePages, candidatePages, registry };
}

/** Throws `PrivacyViolationError` when a page holds a word the registry did not mask exactly so. */
export function verifyEvidence(
  pages: MaskedPage[],
  registry: ReadonlyMap<string, RegisteredWord>,
): void {
  for (const page of pages) {
    for (const word of page.words) {
      if (!isDeepStrictEqual(word, registry.get(word.id)?.masked)) {
        throw new PrivacyViolationError("A masked word differs from what the registry masked");
      }
    }
  }
}

/** The pages as visual lines of `[id, left, display, hint]`, for the reference extraction. */
export function evidenceRows(pages: MaskedPage[]): MaskedRowsPage[] {
  return pages.map(({ page, width, height, words }) => ({
    page,
    width,
    height,
    rows: visualLines(words, (word) => roundHalfEven(centre(word), 1)).map(({ y, words }) => ({
      y,
      words: words.map(({ id, box, display, hint }) => [id, box[0], display, hint ?? ""]),
    })),
  }));
}

/** Each letter as `X` or `x`, each digit as `D`, other characters as they are. */
export function maskedShape(value: string): string {
  return [...value]
    .map((character) => {
      if (/\p{N}/u.test(character)) return "D";
      if (/\p{Uppercase}/u.test(character)) return "X";
      if (/[\p{L}\p{M}]/u.test(character)) return "x";
      return character;
    })
    .join("");
}

function maskedNativePages(
  wordPages: PdfWordPage[],
  registry: Map<string, RegisteredWord>,
): MaskedPage[] {
  const groups = new Map<string, number>();
  return wordPages.map(({ width, height, words }, index) => {
    const sources = new Map<string, string>();
    const masked = words.map(({ text, left, top, right, bottom }): MaskedWord => {
      const key = casefold(text);
      if (!groups.has(key)) groups.set(key, groups.size + 1);
      const id = `w${serial(registry.size + sources.size + 1)}`;
      sources.set(id, text);
      return {
        id,
        box: [left, top, right, bottom],
        display: maskedShape(text),
        sameValue: groups.get(key)!,
        hint: wordHint(text),
      };
    });
    const hints = phraseHints(masked, (id) => sources.get(id)!);
    const page = index + 1;
    const pageWords = masked.map((word) => ({ ...word, hint: hints.get(word.id) ?? word.hint }));
    for (const word of pageWords) {
      registry.set(word.id, { source: sources.get(word.id)!, masked: structuredClone(word), page });
    }
    return { page, width, height, words: pageWords };
  });
}

function maskedCandidatePages(
  candidates: PdfCandidate[],
  registry: Map<string, RegisteredWord>,
): MaskedPage[] {
  const nativeWords = [...registry].map(([id, { source }]) => ({ id, text: casefold(source) }));
  const firstWords = indexByText(nativeWords);
  let cells = 0;
  return candidates.flatMap(({ sheets }, candidateIndex) =>
    sheets.flatMap((sheet, sheetIndex) => {
      const { rows } = sheet;
      const fields = columnFields(sheet);
      if (rows.length === 0 || ![...fields.values()].some(isNameField)) return [];
      const page = 1000 + candidateIndex * 100 + sheetIndex;
      const words = rows.flatMap((row, rowIndex) =>
        row.flatMap((value, column) => {
          if (value.trim() === "") return [];
          cells += 1;
          const field = fields.get(column) ?? "other";
          const masked: MaskedWord = {
            id: `c${serial(cells)}`,
            box: [column * 150 + 10, rowIndex * 24 + 10, column * 150 + 145, rowIndex * 24 + 28],
            display: maskedShape(value),
            hint: `${rowIndex === 0 ? "header" : "field"}:${field}`,
            cell: [rowIndex, column],
          };
          if (rowIndex > 0) {
            masked.hint += `;${(field === "other" ? contextHint(value) : null) ?? wordHint(value)}`;
            const links = uniqueSpelling(value, nativeWords, firstWords);
            if (links.length > 0) masked.sourceWords = links;
          }
          registry.set(masked.id, { source: value, masked: structuredClone(masked), page });
          return [masked];
        }),
      );
      return [
        {
          page,
          width: Math.max(rows[0]!.length, 1) * 150 + 10,
          height: rows.length * 24 + 40,
          words,
          candidateIndex,
          sheetIndex,
        },
      ];
    }),
  );
}

/** The ids of the native words that spell `value` in sequence, when exactly one run does. */
function uniqueSpelling(
  value: string,
  words: { id: string; text: string }[],
  firstWords: Map<string, number[]>,
): string[] {
  const wanted = casefold(value).split(/\s+/u).filter(Boolean);
  const runs = (firstWords.get(wanted[0]!) ?? []).filter((start) =>
    wanted.every((text, offset) => words[start + offset]?.text === text),
  );
  return runs.length === 1
    ? words.slice(runs[0], runs[0]! + wanted.length).map(({ id }) => id)
    : [];
}

function indexByText(words: { text: string }[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  words.forEach(({ text }, position) => index.set(text, [...(index.get(text) ?? []), position]));
  return index;
}

function serial(count: number): string {
  return String(count).padStart(5, "0");
}
