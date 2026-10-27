import type { EmployeeUpdateInput } from "@/__generated__/graphql";

/** The employee fields the panel shows and edits, in the order it lists them. */
export const EMPLOYEE_FIELD_KEYS = [
  "firstName",
  "lastName",
  "email",
  "jobTitle",
  "manager",
  "startDate",
] as const;

export type EmployeeFieldKey = (typeof EMPLOYEE_FIELD_KEYS)[number];

/** An employee's saved values, the manager as their id; null is empty. */
export type EmployeeValues = Record<EmployeeFieldKey, string | null>;

/** The fields whose draft differs from the saved value; an empty draft equals an empty value. */
export function changedFields(
  saved: EmployeeValues,
  draft: Partial<EmployeeValues>,
): EmployeeFieldKey[] {
  return EMPLOYEE_FIELD_KEYS.filter((key) => key in draft && (draft[key] || null) !== saved[key]);
}

/**
 * One `employee.update` for every changed field, an emptied one as null and the manager as
 * `managerId`, with the trimmed reason.
 */
export function toUpdateInput(
  id: string,
  saved: EmployeeValues,
  draft: Partial<EmployeeValues>,
  reason: string,
): EmployeeUpdateInput {
  const changes = Object.fromEntries(
    changedFields(saved, draft).map((key) => [inputKey(key), draft[key] || null]),
  );
  const changeReason = reason.trim();
  return { id, ...changes, ...(changeReason && { changeReason }) };
}

function inputKey(key: EmployeeFieldKey): keyof EmployeeUpdateInput {
  return key === "manager" ? "managerId" : key;
}
