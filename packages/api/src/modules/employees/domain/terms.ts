/** A named set of people who share a working week and time off rules. */
export interface Terms {
  id: string;
  name: string;
  /** People without a location, or at a location without terms, start on the default terms. */
  isDefault: boolean;
}
