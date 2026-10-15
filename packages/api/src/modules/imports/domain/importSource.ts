/** Where the records of the import come from: the Slack workspace or an uploaded file. */
export type ImportSourceKind = "slack" | "file";

/** Whether a source's records are ready; a Slack source always is. */
export type ImportSourceStatus = "mapping" | "mapped" | "failed";

/** Why a file could not be mapped. */
export type ImportSourceFailure = "no_header" | "no_people_columns" | "unavailable";

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
