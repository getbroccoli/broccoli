/** Where the records of the import come from: the Slack workspace, later also files. */
export type ImportSourceKind = "slack";

/** One place people came from; it owns its records. */
export interface ImportSource {
  id: string;
  kind: ImportSourceKind;
  /** The Slack workspace's name; later the file's. */
  name: string;
  readAt: Date;
}
