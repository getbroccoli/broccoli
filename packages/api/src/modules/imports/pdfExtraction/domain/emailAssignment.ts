import { casefold } from "./casefold";
import { InvalidModelOutputError } from "./extractionErrors";
import type { RegisteredWord } from "./maskedEvidence";
import { EMAIL, type SourceRecord } from "./pdfNormalization";

/** The model's answer to the email assignment: rows of the drafts and the email word ids for each. */
export interface EmailAssignments {
  assignments: { row: number; emailIds: string[] }[];
}

/** The native words that are complete emails no record holds yet, ignoring case. */
export function unusedEmailIds(
  registry: ReadonlyMap<string, RegisteredWord>,
  sources: SourceRecord[],
): Set<string> {
  const used = new Set(sources.map(({ email }) => casefold(email ?? "")));
  return new Set(
    [...registry]
      .filter(
        ([id, { source }]) =>
          id.startsWith("w") && EMAIL.test(source) && !used.has(casefold(source)),
      )
      .map(([id]) => id),
  );
}

/**
 * The records with the emails the model assigned to rows without one. Throws
 * `InvalidModelOutputError` for a row that does not exist or is named twice, a row that has a valid
 * email, an id outside `allowed` or used twice, or ids that do not make a complete email.
 */
export function withAssignedEmails(
  sources: SourceRecord[],
  output: EmailAssignments,
  registry: ReadonlyMap<string, RegisteredWord>,
  allowed: ReadonlySet<string>,
): SourceRecord[] {
  const records = sources.map((source) => ({ ...source }));
  const assignedRows = new Set<number>();
  const usedIds = new Set<string>();
  for (const { row, emailIds } of output.assignments) {
    const record = records[row];
    if (!record || assignedRows.has(row) || EMAIL.test(record.email ?? "")) {
      throw new InvalidModelOutputError(
        "An email is assigned to an unknown, repeated or filled row",
      );
    }
    const usable =
      emailIds.length > 0 && emailIds.every((id) => allowed.has(id) && !usedIds.has(id));
    if (!usable || new Set(emailIds).size !== emailIds.length) {
      throw new InvalidModelOutputError("An email assignment names a word it may not use");
    }
    const email = emailIds.map((id) => registry.get(id)!.source).join("");
    if (!EMAIL.test(email)) {
      throw new InvalidModelOutputError("An assigned email is not a complete address");
    }
    emailIds.forEach((id) => usedIds.add(id));
    assignedRows.add(row);
    record.email = email;
  }
  return records;
}
