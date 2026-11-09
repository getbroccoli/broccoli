/**
 * The fields of a person's history lines that are about their employment terms; a name ending in
 * `*` covers every field it starts, such as each time off type's rules.
 */
export const EMPLOYMENT_TERMS_FIELDS = ["terms", "workingPattern", "workingWeek", "timeOff.*"];

/** Which part of a person's record a history line changes, from the fields it changes. */
export function historyAreaOf(fields: readonly string[]): "EMPLOYMENT_TERMS" | "DETAILS" {
  return fields.some(isEmploymentTermsField) ? "EMPLOYMENT_TERMS" : "DETAILS";
}

function isEmploymentTermsField(field: string): boolean {
  return EMPLOYMENT_TERMS_FIELDS.some((name) =>
    name.endsWith("*") ? field.startsWith(name.slice(0, -1)) : field === name,
  );
}
