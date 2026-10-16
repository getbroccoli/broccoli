import { type Cell, isDirectlyBelow, joinWrapped, pageLines, texts } from "./pdfLines";
import type { PdfPage } from "../../../utils";
import type { FileSheet } from "./sheet";

/**
 * A list of one block per person as one sheet: the labels, in first-seen order, are the header
 * row, and each block is a row of the values after its labels. A block starts at each line with
 * the first label that repeats, or at the one-cell unlabelled line above each of them, which then
 * is a first column with an empty header: the person's name. Without a repeating label, three or
 * more labelled lines are one person. Text above the first block is dropped, and so is a line in
 * a page's band below it without a label in any cell, and labelled footers (see `withoutFooters`).
 * Other labelled lines are never noise. An unlabelled line directly under a value is the rest of
 * that value, wrapped. Null when there is no block, or when a line below the first is none of
 * these, or repeats a label of its block. Also which pages start a person's block: the pages the
 * list is read from.
 */
export function readBlocks(pages: PdfPage[]): { sheets: FileSheet[]; pages: boolean[] } | null {
  const lines = withoutFooters(
    withWrappedValues(pageLines(pages)).map((line) => ({ ...line, field: fieldOf(line.cells) })),
    pages.length,
  );
  const labels = lines.flatMap(({ field }) => (field ? [field.label] : []));
  const blockLabel =
    repeatedLabel(labels) ?? (labels.length >= MIN_BLOCK_LINES ? labels[0] : undefined);
  if (blockLabel === undefined) {
    return null;
  }
  const starts = lines.flatMap(({ field }, index) => (field?.label === blockLabel ? [index] : []));
  const isNameLine = (index: number) =>
    lines[index]?.field === null &&
    lines[index].cells.length === 1 &&
    lines[index].page === lines[index + 1]!.page;
  const named = starts.length > 1 && starts.every((start) => isNameLine(start - 1));
  const blockStarts = new Set(starts.map((start) => (named ? start - 1 : start)));
  const header = named ? [""] : [];
  const blocks: Map<string, string>[] = [];
  for (let index = Math.min(...blockStarts); index < lines.length; index += 1) {
    const { cells, field, inBand } = lines[index]!;
    if (blockStarts.has(index)) {
      blocks.push(new Map(named ? [["", cells[0]!.text]] : []));
    }
    const block = blocks.at(-1)!;
    if (field === null) {
      const isNoise = inBand && !cells.some(({ text }) => isLabelled(text));
      if (!blockStarts.has(index) && !isNoise) {
        return null;
      }
      continue;
    }
    if (block.has(field.label)) {
      return null;
    }
    block.set(field.label, field.value);
    if (!header.includes(field.label)) {
      header.push(field.label);
    }
  }
  const startPages = new Set([...blockStarts].map((start) => lines[start]!.page));
  return {
    sheets: [
      {
        name: null,
        rows: [header, ...blocks.map((block) => header.map((label) => block.get(label) ?? ""))],
      },
    ],
    pages: pages.map((_page, index) => startPages.has(index)),
  };
}

/** The first label that occurs again later: the label each person's block starts with. */
export function repeatedLabel(labels: string[]): string | undefined {
  return labels.find((label, index) => labels.indexOf(label, index + 1) > index);
}

/**
 * The label and value of a block line: "Label: value" in one cell, or "Label:" and the value in
 * two. A label is one to four words with a letter and no digit, so "at 10:30" is none.
 */
export function fieldOf(cells: Cell[]): { label: string; value: string } | null {
  if (cells.length > 2 || (cells.length === 2 && !cells[0]!.text.endsWith(":"))) {
    return null;
  }
  const match = /^([^\d:]+):\s+(\S.*)$/u.exec(texts(cells).join(" "));
  if (!match || !isLabel(match[1]!)) {
    return null;
  }
  return { label: match[1]!.trim(), value: match[2]!.trim() };
}

/**
 * The lines without labelled footers such as "Printed on: 16.10.2026": a line in a page's band,
 * below all of its page's other text, whose label no line outside the bands has, and that lies
 * further below that text than any two lines outside the bands lie apart on one page, or repeats
 * with the same value in the band of every page of a longer document. A block's field set in a
 * band continues at the block's line spacing and varies per person.
 */
function withoutFooters<
  Line extends {
    y: number;
    page: number;
    inBand: boolean;
    field: { label: string; value: string } | null;
  },
>(lines: Line[], pageCount: number): Line[] {
  const body = lines.filter(({ inBand }) => !inBand);
  const bodyLabels = new Set(body.flatMap(({ field }) => (field ? [field.label] : [])));
  const bodyGap = Math.max(
    ...body
      .slice(1)
      .map((line, index) => (line.page === body[index]!.page ? body[index]!.y - line.y : 0)),
  );
  const pagesOf = new Map<string, Set<number>>();
  for (const { field, inBand, page } of lines) {
    if (inBand && field !== null) {
      const key = JSON.stringify(field);
      pagesOf.set(key, (pagesOf.get(key) ?? new Set()).add(page));
    }
  }
  /** Below every line outside the bands on its page, by more than `gap`. */
  const isBelowBody = ({ page, y }: Line, gap: number) =>
    body.some((line) => line.page === page) &&
    body.every((line) => line.page !== page || line.y - y > gap);
  const isOnEveryPage = ({ field }: Line) =>
    pageCount > 1 && pagesOf.get(JSON.stringify(field))?.size === pageCount;
  return lines.filter(
    (line) =>
      !(
        line.inBand &&
        line.field !== null &&
        !bodyLabels.has(line.field.label) &&
        (isBelowBody(line, bodyGap) || (isBelowBody(line, 0) && isOnEveryPage(line)))
      ),
  );
}

/**
 * The lines with each block value wrapped onto the lines below it joined to it, before names and
 * blocks are found: an unlabelled line directly below a labelled line, or below its wrapped text,
 * that starts under its value.
 */
function withWrappedValues<Line extends { cells: Cell[]; y: number; page: number }>(
  lines: Line[],
): Line[] {
  const joined: Line[] = [];
  let labelled: Cell[] | undefined;
  for (const [index, line] of lines.entries()) {
    const above = lines[index - 1];
    const isWrapped =
      labelled !== undefined &&
      fieldOf(line.cells) === null &&
      above?.page === line.page &&
      isDirectlyBelow(line, above.y) &&
      isUnderValue(line.cells, labelled);
    if (isWrapped) {
      const value = labelled!.at(-1)!;
      value.text = joinWrapped(value.text, texts(line.cells).join(" "));
      value.end = Math.max(value.end, line.cells.at(-1)!.end);
      continue;
    }
    joined.push(line);
    labelled = fieldOf(line.cells) === null ? undefined : line.cells;
  }
  return joined;
}

/**
 * Text that starts right of a labelled line's start and before its end: under its value, where a
 * value wrapped onto the next line goes, not at the label, where the next person's name starts.
 */
function isUnderValue(cells: Cell[], labelled: Cell[]): boolean {
  const start = cells[0]!.x;
  const line = labelled[0]!;
  return start > line.x + line.tolerance && start < labelled.at(-1)!.end;
}

/** The fewest labelled lines that read as one person's details, not a letter's date and subject. */
const MIN_BLOCK_LINES = 3;

/** Text that starts with a label, with or without its value: "Name:" or "Name: Avery Stone". */
function isLabelled(text: string): boolean {
  const label = /^([^\d:]+):(?:\s|$)/u.exec(text)?.[1];
  return label !== undefined && isLabel(label);
}

function isLabel(text: string): boolean {
  return /\p{L}/u.test(text) && text.trim().split(/\s+/u).length <= 4;
}
