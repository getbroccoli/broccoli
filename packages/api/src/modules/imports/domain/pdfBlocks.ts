import { type Cell, pageLines, texts } from "./pdfLines";
import type { PdfPage } from "../../../utils";
import type { FileSheet } from "./sheet";

/**
 * A list of one block per person as one sheet: the labels, in first-seen order, are the header
 * row, and each block is a row of the values after its labels. A block starts at each line with
 * the first label that repeats, or at the one-cell unlabelled line above each of them, which then
 * is a first column with an empty header: the person's name. Without a repeating label, three or
 * more labelled lines are one person. Text above the first block is dropped, and so is a line in
 * a page's band below it without a label in any cell; labelled lines are never noise. Null when there is
 * no block, or when a line below the first is none of these, or repeats a label of its block.
 */
export function blockSheets(pages: PdfPage[]): FileSheet[] | null {
  const lines = pageLines(pages).map((line) => ({ ...line, field: fieldOf(line.cells) }));
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
      const isNoise = inBand && !cells.some((cell) => fieldOf([cell]) !== null);
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
  return [
    {
      name: null,
      rows: [header, ...blocks.map((block) => header.map((label) => block.get(label) ?? ""))],
    },
  ];
}

/** Which pages hold a line of the PDF's person blocks; none when it has no block list. */
export function blockPages(pages: PdfPage[]): boolean[] {
  if (blockSheets(pages) === null) {
    return [];
  }
  const labelled = new Set(
    pageLines(pages)
      .filter(({ cells }) => fieldOf(cells) !== null)
      .map(({ page }) => page),
  );
  return pages.map((_page, index) => labelled.has(index));
}

/** The first label that occurs again later: the label each person's block starts with. */
export function repeatedLabel(labels: string[]): string | undefined {
  return labels.find((label, index) => labels.indexOf(label, index + 1) > index);
}

/** The fewest labelled lines that read as one person's details, not a letter's date and subject. */
const MIN_BLOCK_LINES = 3;

/**
 * The label and value of a block line: "Label: value" in one cell, or "Label:" and the value in
 * two. A label is one to four words with a letter and no digit, so "at 10:30" is none.
 */
export function fieldOf(cells: Cell[]): { label: string; value: string } | null {
  if (cells.length > 2 || (cells.length === 2 && !cells[0]!.text.endsWith(":"))) {
    return null;
  }
  const match = /^([^\d:]+):\s+(\S.*)$/u.exec(texts(cells).join(" "));
  const label = match?.[1]?.trim() ?? "";
  if (!match || !/\p{L}/u.test(label) || label.split(/\s+/u).length > 4) {
    return null;
  }
  return { label, value: match[2]!.trim() };
}
