/** The import's one object: its fields load what the client selects. */
export const IMPORT = {};

/** GraphQL enum values by their domain names. */
export const AI_SOURCES = {
  broccoli_ai: "BROCCOLI_AI",
  openrouter: "OPENROUTER",
  external_agent: "EXTERNAL_AGENT",
} as const;
export const KINDS = { slack: "SLACK", file: "FILE" } as const;
export const STATUSES = {
  mapping: "MAPPING",
  mapped: "MAPPED",
  failed: "FAILED",
  waiting_for_original_read_consent: "WAITING_FOR_ORIGINAL_READ_CONSENT",
} as const;
export const READERS = {
  parsed_by_broccoli: "PARSED_BY_BROCCOLI",
  answered_by_external_agent: "ANSWERED_BY_EXTERNAL_AGENT",
} as const;
export const AGENT_FILE_PROGRESS = {
  file_found: "FILE_FOUND",
  file_downloading: "FILE_DOWNLOADING",
  file_mapping: "FILE_MAPPING",
} as const;
export const FAILURES = {
  no_people_columns: "NO_PEOPLE_COLUMNS",
  unavailable: "UNAVAILABLE",
  ai_free_period_used: "AI_FREE_PERIOD_USED",
  ai_free_period_over: "AI_FREE_PERIOD_OVER",
  ai_limit_reached: "AI_LIMIT_REACHED",
  original_read_incomplete: "ORIGINAL_READ_INCOMPLETE",
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
  location: "LOCATION",
  manager: "MANAGER",
  startDate: "START_DATE",
} as const;
export const CHOICES = { default: "DEFAULT", picked: "PICKED", typed: "TYPED" } as const;
export const CHECK_KINDS = {
  conflict: "CONFLICT",
  incomplete: "INCOMPLETE",
  manager: "MANAGER",
} as const;
export const MANAGER_PROBLEMS = {
  noPersonMatches: "NO_PERSON_MATCHES",
  severalPeopleMatch: "SEVERAL_PEOPLE_MATCH",
  managersFormALoop: "MANAGERS_FORM_A_LOOP",
} as const;

/** The domain name behind a GraphQL enum value. */
export function keyOf<K extends string, V extends string>(names: Record<K, V>, value: V): K {
  return (Object.keys(names) as K[]).find((key) => names[key] === value)!;
}
/** Setup's invite audiences by their GraphQL names. */
export const SETUP_INVITE_AUDIENCE_INPUTS = {
  ONLY_ADMINS: "only_admins",
  ADMINS_AND_MANAGERS: "admins_and_managers",
  EVERYONE: "everyone",
} as const;
