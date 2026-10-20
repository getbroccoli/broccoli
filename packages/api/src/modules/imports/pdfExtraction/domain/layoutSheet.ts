import type { ColumnMapping, FileSheet } from "../../domain";

/** A sheet a PDF layout builder reconstructed; a builder that knows its columns names them. */
export interface LayoutSheet extends FileSheet {
  knownMapping?: ColumnMapping;
}

/** A builder's columns; a field it does not name has no column. */
export function knownColumnMapping(fields: Partial<ColumnMapping>): ColumnMapping {
  return {
    fullName: null,
    firstName: null,
    lastName: null,
    email: null,
    jobTitle: null,
    startDate: null,
    ...fields,
  };
}
