/** The import's one object: its fields load what the client selects. */
export const IMPORT = {};

/** GraphQL enum values by their domain names. */
export const KINDS = { slack: "SLACK", file: "FILE" } as const;
export const STATUSES = { mapping: "MAPPING", mapped: "MAPPED", failed: "FAILED" } as const;
export const FAILURES = {
  no_people_columns: "NO_PEOPLE_COLUMNS",
  unavailable: "UNAVAILABLE",
} as const;
export const INCOMPLETE_REASONS = {
  firstName: "FIRST_NAME",
  lastName: "LAST_NAME",
  email: "EMAIL",
  other: "OTHER",
} as const;
export const FIELDS = {
  firstName: "FIRST_NAME",
  lastName: "LAST_NAME",
  email: "EMAIL",
  jobTitle: "JOB_TITLE",
  startDate: "START_DATE",
} as const;
export const CHOICES = { default: "DEFAULT", picked: "PICKED", typed: "TYPED" } as const;
export const CHECK_KINDS = { conflict: "CONFLICT", incomplete: "INCOMPLETE" } as const;

/** The domain name behind a GraphQL enum value. */
export function keyOf<K extends string, V extends string>(names: Record<K, V>, value: V): K {
  return (Object.keys(names) as K[]).find((key) => names[key] === value)!;
}
