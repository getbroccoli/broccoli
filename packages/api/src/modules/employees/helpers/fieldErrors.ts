import type { z } from "zod";

import type { FieldError } from "../../../core/applicationError";

/** One error per field: the first problem found is the one worth fixing. */
export function fieldErrorsOf(error: z.ZodError): FieldError[] {
  const byField = new Map<string, string>();
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    if (!byField.has(field)) {
      byField.set(field, fieldErrorCode(issue));
    }
  }
  return [...byField].map(([field, code]) => ({ field, code }));
}

/** The field error code of one issue: `required`, `too_long` or `invalid`. */
export function fieldErrorCode(issue: z.core.$ZodIssue): string {
  if (issue.code === "too_small") {
    return "required";
  }
  if (issue.code === "too_big") {
    return "too_long";
  }
  return "invalid";
}
