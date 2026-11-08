import type { MessageKey } from "@/i18n";
import type { ComponentType } from "react";

/** One field of a record type, as its panel and its history show it. */
export interface RecordField {
  /** The history field key, such as `jobTitle`. */
  key: string;
  label: string;
  /** The panel section the field sits in, such as "Job"; none for a field shown elsewhere. */
  section?: string;
  /** A text input, a date picker, or the record type's own editor. */
  editor: "text" | "date" | ComponentType<FieldEditorProps>;
  /** How a stored value shows, such as a date as DD/MM/YYYY. */
  format: (value: string) => string;
  /** Never among the panel's sections: only in history, such as a person's sign-in, or elsewhere. */
  historyOnly?: boolean;
}

/**
 * What the web app knows about a record type: its fields and which one names a record. Kept in
 * the frontend until the server describes record types.
 */
export interface RecordDescription {
  fields: RecordField[];
  /** The field whose value names the record in "added …" and "removed …". */
  titleField: string;
  /** How a created line reads instead of "added … with N fields", with `{title}`, such as "set up {title}". */
  createdAs?: MessageKey;
  /**
   * How a one-field change reads instead of "changed … to …"; null keeps that wording. `madeOn` is
   * the company day it was made, as `YYYY-MM-DD`.
   */
  changedAs?: (
    change: {
      field: string;
      oldValue: string | null;
      newValue: string | null;
      newLabel?: string | null;
    },
    madeOn: string,
  ) => string | null;
}

/** What a field's editor gets from the panel. */
export interface FieldEditorProps {
  field: RecordField;
  /** The record the field belongs to. */
  recordId: string;
  value: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: string) => void;
  /** The person finished with the field; its value stays in the draft. */
  onDone: () => void;
  /** Escape: the field goes back to its saved value. */
  onRevert: () => void;
}
