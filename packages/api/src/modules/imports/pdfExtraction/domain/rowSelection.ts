import type { DraftRecord, MaskedPage, MaskedWord } from "../../../../integrations/ai";
import { InvalidModelOutputError } from "./extractionErrors";
import type { RegisteredWord } from "./maskedEvidence";
import {
  type DateOrder,
  dateOrderOf,
  isSourceField,
  SOURCE_FIELDS,
  type SourceField,
  type SourceRecord,
} from "./pdfNormalization";

/** The model's answer to the row selection: candidate, sheet and row indexes only. */
export interface RowSelection {
  rows: RowPosition[];
}

export interface RowPosition {
  candidate: number;
  sheet: number;
  row: number;
}

/** A selected row: its values restored from the local cells, and the ids that stand for them. */
export interface RestoredRow {
  source: SourceRecord;
  draft: DraftRecord;
  position: RowPosition;
}

/**
 * The rows the model selected, each restored whole from its local cells; a company or emergency
 * contact row is left out. Throws `InvalidModelOutputError` for a row that does not exist, a
 * header, a row named twice, rows of two candidates, or a row without a name.
 */
export function selectedRows(
  selection: RowSelection,
  candidatePages: MaskedPage[],
  registry: ReadonlyMap<string, RegisteredWord>,
): RestoredRow[] {
  const cells = cellsByRow(candidatePages);
  const selected = new Set<string>();
  const candidates = new Set<number>();
  const rows: RestoredRow[] = [];
  for (const position of selection.rows) {
    const key = rowKey(position);
    const words = cells.get(key);
    if (!words || selected.has(key)) {
      throw new InvalidModelOutputError("The selection names an unknown, header or repeated row");
    }
    selected.add(key);
    candidates.add(position.candidate);
    if (words.some((word) => hintsOf(word).includes("excluded_contact_heading"))) continue;
    rows.push(restoredRow(words, position, registry));
  }
  if (candidates.size > 1) {
    throw new InvalidModelOutputError("The selection mixes alternative layouts");
  }
  return withSharedDateOrder(rows);
}

function restoredRow(
  words: MaskedWord[],
  position: RowPosition,
  registry: ReadonlyMap<string, RegisteredWord>,
): RestoredRow {
  const ids = Object.fromEntries(SOURCE_FIELDS.map((field) => [field, [] as string[]])) as Record<
    SourceField,
    string[]
  >;
  for (const word of words) {
    const field = hintsOf(word)[0]!.replace(/^field:/u, "");
    const sourceField = field === "fullName" ? "name" : field;
    if (isSourceField(sourceField)) ids[sourceField].push(word.id);
  }
  const value = (field: SourceField) =>
    ids[field].map((id) => registry.get(id)!.source).join(" ") || null;
  const name = value("name");
  if (!name && !value("firstName") && !value("lastName")) {
    throw new InvalidModelOutputError("A selected row has no name");
  }
  const startDate = value("startDate");
  const source: SourceRecord = {
    name,
    firstName: value("firstName"),
    lastName: value("lastName"),
    email: value("email"),
    jobTitle: value("jobTitle"),
    startDate,
    nameSource: name ? "combined" : "separate",
    dateOrder: dateOrderOf(startDate),
  };
  return {
    source,
    draft: { ...ids, nameSource: source.nameSource, dateOrder: source.dateOrder },
    position,
  };
}

/** When the selected dates show exactly one day-month order, the dates without one take it. */
function withSharedDateOrder(rows: RestoredRow[]): RestoredRow[] {
  const orders = new Set(
    rows.flatMap(({ source }) =>
      source.dateOrder === "dmy" || source.dateOrder === "mdy" ? [source.dateOrder] : [],
    ),
  );
  if (orders.size !== 1) return rows;
  const [order] = orders as Set<DateOrder>;
  return rows.map((row) =>
    row.source.dateOrder === null
      ? {
          ...row,
          source: { ...row.source, dateOrder: order! },
          draft: { ...row.draft, dateOrder: order! },
        }
      : row,
  );
}

/** The cells of every body row, by candidate, sheet and row. */
function cellsByRow(pages: MaskedPage[]): Map<string, MaskedWord[]> {
  const cells = new Map<string, MaskedWord[]>();
  for (const { candidateIndex, sheetIndex, words } of pages) {
    if (candidateIndex === undefined || sheetIndex === undefined) continue;
    for (const word of words) {
      const row = word.cell![0];
      if (row === 0) continue;
      const key = rowKey({ candidate: candidateIndex, sheet: sheetIndex, row });
      cells.set(key, [...(cells.get(key) ?? []), word]);
    }
  }
  return cells;
}

function rowKey({ candidate, sheet, row }: RowPosition): string {
  return `${candidate}/${sheet}/${row}`;
}

function hintsOf(word: MaskedWord): string[] {
  return (word.hint ?? "").split(";");
}
