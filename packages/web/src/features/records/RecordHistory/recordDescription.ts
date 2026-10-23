/** One field of a record type, as its panel and its history show it. */
export interface RecordField {
  /** The history field key, such as `jobTitle`. */
  key: string;
  label: string;
  /** The panel section the field sits in, such as "Job". */
  section: string;
  editor: "text" | "date";
  /** How a stored value shows, such as a date as DD/MM/YYYY. */
  format: (value: string) => string;
}

/**
 * What the web app knows about a record type: its fields and which one names a record. Kept in
 * the frontend until the server describes record types.
 */
export interface RecordDescription {
  fields: RecordField[];
  /** The field whose value names the record in "added …" and "removed …". */
  titleField: string;
}
