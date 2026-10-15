/** Where the records of the import come from: the Slack workspace or an uploaded file. */
export type ImportSourceKind = "slack" | "file";

/** Whether a source's records are ready; a Slack source always is. */
export type ImportSourceStatus = "mapping" | "mapped" | "failed";

/** Why a file could not be mapped. */
export type ImportSourceFailure = "no_people_columns" | "unavailable";

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
}

/** A file source with what its mapping runs need. */
export interface FileSource extends ImportSource {
  fileId: string;
  /** The current run; a job of an earlier run writes nothing. */
  mappingAttempt: number;
}

/** How a mapping run ended. */
export type MappingOutcome =
  { status: "mapped" } | { status: "failed"; failure: ImportSourceFailure };
