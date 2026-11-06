import { z } from "zod";

import { invalidInput } from "../../../core/applicationError";
import { fieldErrorsOf } from "../helpers";

/** A named set of people who share a working week and time off rules. */
export interface Terms {
  id: string;
  name: string;
  /** People without a location, or at a location without terms, start on the default terms. */
  isDefault: boolean;
}

/** Why terms cannot be deleted; deleting them would change where people start or rewrite history. */
export type TermsDeleteBlocker =
  | "default_terms"
  | "terms_had_people"
  | "location_starts_people_on_terms";

/** Other terms already have this name, ignoring case and surrounding spaces. */
export class TermsNameTakenError extends Error {
  constructor() {
    super("Other terms already have this name");
    this.name = "TermsNameTakenError";
  }
}

/** A trimmed terms name; throws `INVALID_INPUT` on the `name` field when blank or too long. */
export function parseTermsName(name: string): string {
  const result = termsSchema.safeParse({ name });
  if (!result.success) {
    throw invalidInput(fieldErrorsOf(result.error));
  }
  return result.data.name;
}

/** The first reason that keeps terms from being deleted, or null when they can be. */
export function deleteBlockerOf(
  terms: Terms,
  { hadPeople, locationCount }: { hadPeople: boolean; locationCount: number },
): TermsDeleteBlocker | null {
  if (terms.isDefault) return "default_terms";
  if (hadPeople) return "terms_had_people";
  if (locationCount > 0) return "location_starts_people_on_terms";
  return null;
}

/** The sentence a refused delete gives, naming the locations that start people on the terms. */
export function deleteRefusal(blocker: TermsDeleteBlocker, locationNames: readonly string[]): string {
  switch (blocker) {
    case "default_terms":
      return "The default terms stay, because people without a location start on them.";
    case "terms_had_people":
      return "Terms people were on stay, so their history stays true.";
    case "location_starts_people_on_terms":
      return locationNames.length === 1
        ? `${locationNames[0]} starts new people here. Choose other terms for it in Settings › Locations first.`
        : `${listed(locationNames)} start new people here. Choose other terms for them in Settings › Locations first.`;
  }
}

/** "Glasgow, Leeds and York". */
function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const termsSchema = z.object({ name: z.string().trim().min(1).max(100) });
