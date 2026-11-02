import { z } from "zod";

import { invalidInput } from "../../../core/applicationError";
import type { FieldChange } from "../../../core/records";
import { fieldErrorsOf } from "../helpers";

const NAME_MAX_LENGTH = 100;

/** A named place where people work, such as an office or "Remote". */
export interface Location {
  id: string;
  /** Unique, ignoring case and surrounding spaces. */
  name: string;
}

/** Another location already has this name, ignoring case and surrounding spaces. */
export class LocationNameTakenError extends Error {
  constructor() {
    super("Another location already has this name");
    this.name = "LocationNameTakenError";
  }
}

/** A trimmed location name; throws `INVALID_INPUT` on the `name` field when blank or too long. */
export function parseLocationName(name: string): string {
  const result = locationSchema.safeParse({ name });
  if (!result.success) {
    throw invalidInput(fieldErrorsOf(result.error));
  }
  return result.data.name;
}

/**
 * The history change of a new location: their ids, with their names as labels so the line still
 * reads after a rename or removal; empty when the location stays.
 */
export function locationChanges(before: Location | null, after: Location | null): FieldChange[] {
  if (before?.id === after?.id) {
    return [];
  }
  return [
    {
      field: "location",
      oldValue: before?.id ?? null,
      newValue: after?.id ?? null,
      oldLabel: before?.name ?? null,
      newLabel: after?.name ?? null,
    },
  ];
}

/** A location name as stored: trimmed, 1 to 100 characters. */
export const locationNameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);

const locationSchema = z.object({ name: locationNameSchema });
