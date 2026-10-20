import type { PdfPage } from "../../../../utils";
import { fieldOf, readBlocks, repeatedLabel } from "./pdfBlocks";
import { alignsWith, type Cell, isEmail, pageLines, texts, withWrapped } from "./pdfLines";
import type { FileSheet } from "../../domain";

/**
 * A PDF's staff tables as sheets, or, in a PDF without a table, its person blocks as one sheet;
 * null when neither is found, or when a line below the first header is none of a header, a row,
 * a total, a sub-heading, a running title or a page's band text: then part of the staff content
 * could not be read, and none of it is. A table starts at a line of two or more cells that the
 * next line's cells line up with. Text above the first one is dropped, and so is a one-cell
 * sub-heading above a later one. On each later page, the text above the first line of the table,
 * such as a running title or a repeated header, is dropped too. Tables with equal header texts
 * join into one sheet: one sheet has no name, several are "Table 1", "Table 2", …. A table beside
 * person blocks, a label repeated outside the page bands, is refused: the blocks would be left out.
 * So is a column with an email address in some rows and other text in others: a layout, such as
 * label and value columns or an org chart, read as a table of wrong people.
 */
export function pdfSheets(pages: PdfPage[]): FileSheet[] | null {
  const read = readTables(pages);
  if (read === null) {
    return readBlocks(pages)?.sheets ?? null;
  }
  const bodyLabels = pageLines(pages)
    .filter(({ inBand }) => !inBand)
    .flatMap(({ cells }) => fieldOf(cells)?.label ?? []);
  if (!read.complete || repeatedLabel(bodyLabels) !== undefined) {
    return null;
  }
  const sheets = new Map<string, string[][]>();
  for (const { header, lines } of read.tables) {
    const headerRow = header.map(({ text }) => text);
    const width = sideBySideWidth(headerRow);
    for (let start = 0; start < headerRow.length; start += width) {
      const part = (row: string[]) => row.slice(start, start + width);
      const key = JSON.stringify(part(headerRow));
      const rows = sheets.get(key) ?? [part(headerRow)];
      rows.push(
        ...lines.map((line) => part(rowOf(line, header))).filter((row) => row.some(Boolean)),
      );
      sheets.set(key, rows);
    }
  }
  if ([...sheets.values()].some(hasMixedEmailColumn)) {
    return null;
  }
  const named = sheets.size > 1;
  return [...sheets.values()].map((rows, index) => ({
    name: named ? `Table ${index + 1}` : null,
    rows: withRowNumbersApart(rows),
  }));
}

/**
 * Whether a page is a scan or photo: it has images but no visible text, or images cover at least
 * 15% of it and its text gives no staff row below a table's header on that page, or outside the
 * page's bands, and starts no person block on that page. A footer or a title over a scan may line
 * up with the columns, but it sits in the bands. One such page refuses the whole file.
 */
export function hasScannedPage(pages: PdfPage[]): boolean {
  const textPages = readTables(pages)?.textPages ?? readBlocks(pages)?.pages ?? [];
  return pages.some(
    ({ items, imageCoverage }, page) =>
      (imageCoverage > 0 && items.length === 0) ||
      (imageCoverage >= SCAN_COVERAGE && textPages[page] !== true),
  );
}

/**
 * A column with an email address in some rows and other text in others. A placeholder for a
 * missing email, four characters at most without an "@" such as "n/a" or "k.A.", is no text.
 */
function hasMixedEmailColumn([header, ...rows]: string[][]): boolean {
  return header!.some((_label, column) => {
    const values = rows
      .map((row) => row[column]!)
      .filter((text) => text.includes("@") || text.length > 4);
    return values.some(isEmail) && !values.every(isEmail);
  });
}

/**
 * The width of each of the tables printed side by side under one header line, such as "Name, Room,
 * Name, Room": the header repeats its columns after the first, which may name each table, as
 * "Faculty" and "Staff" do. The whole header when it repeats nothing.
 */
function sideBySideWidth(header: string[]): number {
  for (let width = 2; width <= header.length / 2; width += 1) {
    const repeats =
      header.length % width === 0 &&
      header.every((text, index) => index % width === 0 || text === header[index % width]);
    if (repeats) return width;
  }
  return header.length;
}

/**
 * The rows with numbers printed in front of a column's values in their own column before it: each
 * value starts with a number, and the numbers ascend, as row and personnel numbers do. "1 Porsch,
 * Oliver" is the row number 1 and the name "Porsch, Oliver".
 */
function withRowNumbersApart([header, ...rows]: string[][]): string[][] {
  const numbered = header!.findIndex((_label, column) => {
    const numbers = rows.map((row) => /^(\d+)\s+\D/u.exec(row[column]!)?.[1]);
    return (
      rows.length > 1 &&
      numbers.every(
        (number, index) =>
          number !== undefined && (index === 0 || Number(number) > Number(numbers[index - 1])),
      )
    );
  });
  if (numbered < 0) return [header!, ...rows];
  const apart = (row: string[], number: string, value: string) => [
    ...row.slice(0, numbered),
    number,
    value,
    ...row.slice(numbered + 1),
  ];
  return [
    apart(header!, "No.", header![numbered]!),
    ...rows.map((row) => {
      const [, number, value] = /^(\d+)\s+(.*)$/su.exec(row[numbered]!)!;
      return apart(row, number!, value!);
    }),
  ];
}

/** Less than a scan of a list: a logo, a signature, a stamp. */
const SCAN_COVERAGE = 0.15;

/**
 * A line that reads as a row of the table: two or more cells with words or numbers, each
 * starting at a header column. A title beside a page number, or dots over a scan, is not one.
 */
function isStaffRow(line: Cell[], header: Cell[]): boolean {
  return line.filter(({ text }) => /[\p{L}\p{N}]/u.test(text)).length >= 2 && linesUp(line, header);
}

/** Lines starting with one of these words in their first worded cell are totals, not people. */
const TOTAL_WORDS = /^(summe|gesamt|totals?|anzahl|subtotals?)\b/iu;

/** A total or subtotal: its first worded cell is a total word, or no cell has a letter. */
function isTotal(line: Cell[]): boolean {
  const worded = line.find(({ text }) => /\p{L}/u.test(text));
  return worded === undefined || TOTAL_WORDS.test(worded.text);
}

/**
 * Every cell starts at a column of the header, and none runs over the start of a column that has
 * no cell of its own in the line, as prose does. A lone cell is a row only in the first column: a
 * person with only a name. Elsewhere it is text away from the value it might belong to.
 */
function isRow(line: Cell[], header: Cell[]): boolean {
  const isFilled = (column: Cell) => line.some((cell) => alignsWith(cell, column, header));
  return (
    linesUp(line, header) &&
    (line.length > 1 || isFilled(header[0]!)) &&
    !line.some((cell) =>
      header.some(
        (column) =>
          column.x > cell.x + cell.tolerance &&
          column.x < cell.end - cell.tolerance &&
          !isFilled(column),
      ),
    )
  );
}

/** A table: its header and the lines below it that are its rows. */
interface Table {
  header: Cell[];
  lines: Cell[][];
}

/**
 * The tables in page order, which pages show a header with a staff row of its table below it, and
 * whether every line below the first header was read; null when no table is found.
 */
function readTables(
  pages: PdfPage[],
): { tables: Table[]; textPages: boolean[]; complete: boolean } | null {
  const lines = pageLines(pages);
  const runningTexts = repeatedOnPages(lines);
  const bandTexts = repeatedInBands(lines);
  let complete = true;
  const tables: Table[] = [];
  const textPages = pages.map(() => false);
  let table: Table = { header: [], lines: [] };
  /**
   * The header that starts a table at `at`, its wrapped lines joined in. A later table starts only
   * under a sub-heading of its own, a one-cell line that is not a running title, or with the
   * current table's header texts: rows whose columns moved look like a header and a row.
   */
  const headerAt = (at: number) => {
    if (lines[at] === undefined) {
      return null;
    }
    const { cells, end } = withWrapped(lines, at, lines[at].cells.length);
    const above = lines[at - 1]?.cells ?? [];
    const isHeadedOrFirst =
      table.header.length === 0 ||
      (above.length === 1 && !runningTexts.has(above[0]!.text)) ||
      sameRow(texts(cells), texts(table.header));
    const starts =
      isHeader(cells, lines[end]?.cells) && !linesUp(cells, table.header) && isHeadedOrFirst;
    return starts ? { cells, end } : null;
  };
  /** The table line at `at` with the lines wrapped below it joined in. */
  const tableLineAt = (at: number) => withWrapped(lines, at, table.header.length);
  let headerPage = -1;
  let page = -1;
  let pageStarted = false;
  for (let index = 0; index < lines.length; index += 1) {
    const next = lines[index + 1]?.cells;
    if (lines[index]!.page !== page) {
      page = lines[index]!.page;
      pageStarted = false;
      const repeated = repeatedHeaderAt(lines, index, table, tableLineAt);
      if (repeated > index) {
        index = repeated - 1;
        continue;
      }
    }
    const header = headerAt(index);
    if (header !== null) {
      table = { header: header.cells, lines: [] };
      tables.push(table);
      headerPage = page;
      pageStarted = true;
      index = header.end - 1;
      continue;
    }
    const { inBand } = lines[index]!;
    const { cells, end } = tableLineAt(index);
    const isRunningTitle = !pageStarted && !(cells.length >= 2 && linesUp(cells, table.header));
    const isSubHeading =
      cells.length === 1 &&
      next !== undefined &&
      (headerAt(index + 1) !== null ||
        isRepeatedHeader(tableLineAt(index + 1).cells, table.header));
    if (isRunningTitle || isSubHeading) {
      continue;
    }
    pageStarted = true;
    index = end - 1;
    if (isRepeatedHeader(cells, table.header)) {
      headerPage = page;
      continue;
    }
    const isBandText =
      lines[index]!.inBand &&
      (cells.length < 2 || bandTexts.has(withoutDigits(cells)) || !isRow(cells, table.header));
    if (isBandText || isTotal(cells)) {
      continue;
    }
    if (!isRow(cells, table.header)) {
      complete = false;
      continue;
    }
    table.lines.push(cells);
    if ((headerPage === page || !inBand) && isStaffRow(cells, table.header)) {
      textPages[page] = true;
    }
  }
  return tables.length > 0 ? { tables, textPages, complete } : null;
}

/** Band lines found on more than one page once their digits are dropped: "Seite 2 von 3". */
function repeatedInBands(lines: { cells: Cell[]; page: number; inBand: boolean }[]): Set<string> {
  const pagesOf = new Map<string, Set<number>>();
  for (const { cells, page } of lines.filter(({ inBand }) => inBand)) {
    const text = withoutDigits(cells);
    pagesOf.set(text, (pagesOf.get(text) ?? new Set()).add(page));
  }
  return new Set([...pagesOf].filter(([, pages]) => pages.size > 1).map(([text]) => text));
}

function withoutDigits(line: Cell[]): string {
  return JSON.stringify(texts(line)).replace(/\d/gu, "");
}

/**
 * Where the page that starts at `start` repeats the table's header with only running titles
 * above it: when it is the page's first line of the table, or it lies in the page's top quarter.
 * -1 otherwise: a header repeated mid-page under people keeps them.
 */
function repeatedHeaderAt(
  lines: { cells: Cell[]; page: number; inTopQuarter: boolean }[],
  start: number,
  table: Table,
  tableLineAt: (at: number) => { cells: Cell[] },
): number {
  const page = lines[start]!.page;
  const onPage = lines.slice(start).filter((line) => line.page === page);
  const at = onPage.findIndex((_line, offset) =>
    isRepeatedHeader(tableLineAt(start + offset).cells, table.header),
  );
  const firstOfTable = onPage.findIndex(
    ({ cells }) => cells.length >= 2 && linesUp(cells, table.header),
  );
  return at >= 0 && (at === firstOfTable || onPage[at]!.inTopQuarter) ? start + at : -1;
}

/** Texts of one-cell lines found on more than one page: running titles, not sub-headings. */
function repeatedOnPages(lines: { cells: Cell[]; page: number }[]): Set<string> {
  const pagesOf = new Map<string, Set<number>>();
  for (const { cells, page } of lines.filter(({ cells }) => cells.length === 1)) {
    pagesOf.set(cells[0]!.text, (pagesOf.get(cells[0]!.text) ?? new Set()).add(page));
  }
  return new Set([...pagesOf].filter(([, pages]) => pages.size > 1).map(([text]) => text));
}

/**
 * Two or more cells without a digit that the next line's two or more cells line up with, unless
 * both are a label and its value: a person block's lines in label and value columns.
 */
function isHeader(line: Cell[], next: Cell[] | undefined): boolean {
  return (
    line.length >= 2 &&
    !line.some(({ text }) => /\d/u.test(text)) &&
    next !== undefined &&
    next.length >= 2 &&
    linesUp(next, line) &&
    !(fieldOf(line) !== null && fieldOf(next) !== null)
  );
}

function isRepeatedHeader(line: Cell[], header: Cell[]): boolean {
  return sameRow(
    rowOf(line, header),
    header.map(({ text }) => text),
  );
}

/** Each cell starts where one of the header's cells starts. */
function linesUp(line: Cell[], header: Cell[]): boolean {
  return line.every((cell) => header.some((column) => alignsWith(cell, column, header)));
}

/**
 * The line's values by column: a cell belongs to the header column it lines up with, or else to
 * the last column starting at or left of it.
 */
function rowOf(line: Cell[], header: Cell[]): string[] {
  const row = header.map(() => "");
  for (const cell of line) {
    const aligned = header.findIndex((column) => alignsWith(cell, column, header));
    const column =
      aligned >= 0
        ? aligned
        : Math.max(
            0,
            header.findLastIndex(({ x }) => x <= cell.x + cell.tolerance),
          );
    row[column] = row[column] ? `${row[column]} ${cell.text}` : cell.text;
  }
  return row;
}

function sameRow(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
