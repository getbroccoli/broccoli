/** Where the records of the import come from: the Slack workspace or an uploaded file. */
export type ImportSourceKind = "slack" | "file";

/**
 * Who read a file source's people: Broccoli's model, or the owner's external agent answering
 * Broccoli's masked questions.
 */
export const IMPORT_SOURCE_READERS = ["parsed_by_broccoli", "answered_by_external_agent"] as const;

export type ImportSourceReader = (typeof IMPORT_SOURCE_READERS)[number];

/** Whether a source's records are ready; a Slack source always is. */
export type ImportSourceStatus = "mapping" | "mapped" | "failed";

/**
 * Why a file could not be mapped: no people in it, the model failed, or Broccoli AI's free use
 * is used up (`ai_*`), which the owner's own key gets past.
 */
export const IMPORT_SOURCE_FAILURES = [
  "no_people_columns",
  "unavailable",
  "ai_free_period_used",
  "ai_free_period_over",
  "ai_limit_reached",
] as const;

export type ImportSourceFailure = (typeof IMPORT_SOURCE_FAILURES)[number];

/** One place people came from; it owns its records. */
export interface ImportSource {
  id: string;
  kind: ImportSourceKind;
  /** The Slack workspace's name, or the file's. */
  name: string;
  readAt: Date;
  status: ImportSourceStatus;
  /** Set when `failed`. */
  failure: ImportSourceFailure | null;
  /** The AI provider's own words, when it refused the file for good. */
  failureMessage: string | null;
  readBy: ImportSourceReader;
  /** When the external agent first read the file's questions; null until it does. */
  pickedUpByExternalAgentAt: Date | null;
}

/** A file source with what its mapping runs need. */
export interface FileSource extends ImportSource {
  fileId: string;
  /** The current run; a job of an earlier run writes nothing. */
  mappingAttempt: number;
}

/** How a mapping run ended. */
export type MappingOutcome =
  | { status: "mapped" }
  | { status: "failed"; failure: ImportSourceFailure; failureMessage?: string | null };
