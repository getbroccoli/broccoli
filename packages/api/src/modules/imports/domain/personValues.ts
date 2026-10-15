import { z } from "zod";

import type { ImportEmployeeValues } from "./importEmployee";

/** The trimmed text, or null when it is missing or blank. */
export function nonBlank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** The trimmed, lowercased email, or null when it is not a valid email. */
export function parseEmail(raw: string | undefined): string | null {
  const normalised = raw?.trim().toLowerCase() ?? "";
  return email.safeParse(normalised).success ? normalised : null;
}

/** A full name split at its last space; a single word becomes the first name. */
export function splitFullName(
  fullName: string,
): Pick<ImportEmployeeValues, "firstName" | "lastName"> {
  const lastSpace = fullName.lastIndexOf(" ");
  return lastSpace === -1
    ? { firstName: fullName, lastName: null }
    : { firstName: fullName.slice(0, lastSpace).trim(), lastName: fullName.slice(lastSpace + 1) };
}

const email = z.email();
