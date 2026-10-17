import type { ImportEmployeeField } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** The import employee fields review shows, by their GraphQL name. */
export type EmployeeFieldKey = "firstName" | "lastName" | "email" | "jobTitle" | "startDate";

export const FIELD_ENUMS = {
  firstName: "FIRST_NAME",
  lastName: "LAST_NAME",
  email: "EMAIL",
  jobTitle: "JOB_TITLE",
  startDate: "START_DATE",
} as const satisfies Record<EmployeeFieldKey, ImportEmployeeField>;

const FIELD_KEYS = Object.fromEntries(
  Object.entries(FIELD_ENUMS).map(([key, value]) => [value, key]),
) as Record<ImportEmployeeField, EmployeeFieldKey>;

/** The field's key for a GraphQL enum value. */
export function fieldKeyOf(field: ImportEmployeeField): EmployeeFieldKey {
  return FIELD_KEYS[field];
}

/** "Job title", as a label. */
export function fieldLabel(field: EmployeeFieldKey): string {
  return t(`setup.review.field.${field}`);
}

/** "3 job titles". */
export function valuesLabel(field: EmployeeFieldKey, count: number): string {
  return t(`setup.review.values.${field}`, { count: String(count) });
}

/** "job titles", inside a sentence. */
export function pluralLabel(field: EmployeeFieldKey): string {
  return t(`setup.review.plural.${field}`);
}

/** "Avery Stone", or "Not set" for an import employee without a name. */
export function employeeNameOf(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ") || t("setup.review.notSet");
}
