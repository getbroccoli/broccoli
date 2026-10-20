import type { DraftRecord } from "../../../../integrations/ai";
import { InvalidModelOutputError } from "./extractionErrors";
import type { RegisteredWord } from "./maskedEvidence";
import {
  dateOrderOf,
  SOURCE_FIELDS,
  type SourceField,
  type SourceRecord,
} from "./pdfNormalization";

/** The model's answer to the reference extraction: each person as word ids per field. */
export interface ReferenceOutput {
  records: DraftRecord[];
}

/**
 * The records the model gave as word ids, restored from the registry: emails and dates join their
 * words directly, other fields with a space. A record without name words is left out. Throws
 * `InvalidModelOutputError` for an unknown id, an id named twice in one field, or a name given both
 * whole and in parts.
 */
export function referencedRecords(
  output: ReferenceOutput,
  registry: ReadonlyMap<string, RegisteredWord>,
): { source: SourceRecord; draft: DraftRecord }[] {
  return output.records.flatMap((draft) => {
    const whole = draft.name.length;
    const parts = draft.firstName.length + draft.lastName.length;
    const [named, other] = draft.nameSource === "combined" ? [whole, parts] : [parts, whole];
    if (other > 0) {
      throw new InvalidModelOutputError("A record gives a name both whole and in parts");
    }
    if (named === 0) return [];
    const value = (field: SourceField) => {
      const ids = draft[field];
      if (ids.some((id) => !registry.has(id)) || new Set(ids).size !== ids.length) {
        throw new InvalidModelOutputError("A record names an unknown or repeated word");
      }
      const separator = field === "email" || field === "startDate" ? "" : " ";
      return ids.map((id) => registry.get(id)!.source).join(separator) || null;
    };
    const values = Object.fromEntries(
      SOURCE_FIELDS.map((field) => [field, value(field)]),
    ) as Record<SourceField, string | null>;
    return [
      {
        source: {
          ...values,
          nameSource: draft.nameSource,
          dateOrder: draft.dateOrder ?? dateOrderOf(values.startDate),
        },
        draft,
      },
    ];
  });
}
