import type { DraftRecord } from "../../../../integrations/ai";
import type { IncomingRecord } from "../../domain";
import type { RegisteredWord } from "./maskedEvidence";
import { normalizedRecord, type SourceRecord } from "./pdfNormalization";

/** A person the extraction restored: the printed values and the ids they came from. */
export interface RestoredPerson {
  source: SourceRecord;
  draft: DraftRecord;
}

/**
 * The people as import records, values normalized and the printed values with their ids kept in
 * `raw`. Each id is where the person's name is printed, with an ordinal for a name printed at one
 * place twice, so a mapping run gives the same ids however the model orders its answer.
 */
export function incomingRecords(
  people: RestoredPerson[],
  registry: ReadonlyMap<string, RegisteredWord>,
): IncomingRecord[] {
  const occurrences = new Map<string, number>();
  return people.map(({ source, draft }) => {
    const position = namePosition(draft, registry);
    const occurrence = (occurrences.get(position) ?? 0) + 1;
    occurrences.set(position, occurrence);
    return {
      externalId: `${position}#${occurrence}`,
      raw: { source, references: draft },
      values: normalizedRecord(source),
    };
  });
}

/** The page and place of the first name word: native when a cell links to one, else the cell. */
function namePosition(draft: DraftRecord, registry: ReadonlyMap<string, RegisteredWord>): string {
  const id = [...draft.name, ...draft.firstName, ...draft.lastName][0];
  const word = id === undefined ? undefined : registry.get(id);
  if (!word) return "pdf:unnamed";
  const native = word.masked.sourceWords?.[0];
  const printed = native === undefined ? word : registry.get(native)!;
  const [left, top] = printed.masked.box;
  return printed.masked.cell
    ? `pdf:${printed.page}:row${printed.masked.cell[0]}`
    : `pdf:${printed.page}:${Math.round(left)}:${Math.round(top)}`;
}
