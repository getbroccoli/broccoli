import type { AiSource } from "../../../core/instance";

/** Where the records of the import come from: the Slack workspace or an uploaded file. */
export type ImportSourceKind = "slack" | "file";

/**
 * Who read a file source's people: Broccoli's model, or the owner's external agent answering
 * Broccoli's masked questions.
 */
export const IMPORT_SOURCE_READERS = ["parsed_by_broccoli", "answered_by_external_agent"] as const;

export type ImportSourceReader = (typeof IMPORT_SOURCE_READERS)[number];

/**
 * Whether a source's records are ready; a Slack source always is. A PDF waits for the owner's
 * consent before any AI reads it, since Broccoli cannot mask its rows.
 */
export const IMPORT_SOURCE_STATUSES = [
  "mapping",
  "mapped",
  "failed",
  "waiting_for_original_read_consent",
] as const;

export type ImportSourceStatus = (typeof IMPORT_SOURCE_STATUSES)[number];

/**
 * Why a file could not be mapped: no people in it, the model failed, Broccoli AI's free use
 * is used up (`ai_*`), which the owner's own key gets past, or the file was too long for the
 * model to read in full.
 */
export const IMPORT_SOURCE_FAILURES = [
  "no_people_columns",
  "unavailable",
  "ai_free_period_used",
  "ai_free_period_over",
  "ai_limit_reached",
  "original_read_incomplete",
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
  /** When the external agent first read the file's questions or fetched it; null until it does. */
  pickedUpByExternalAgentAt: Date | null;
  /** When the owner let AI read the original file in full; null without that consent. */
  originalReadAllowedAt: Date | null;
  /** The provider that last read the original successfully; null for managed or older reads. */
  originalReadAiSource: AiSource | null;
}

/**
 * How the external agent handles a file waiting for it: answer Broccoli's masked questions, or,
 * once the owner allowed it, read the original file and send its people.
 */
export type ExternalAgentParseFileWay = "answer_masked_questions" | "read_original_file";

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
