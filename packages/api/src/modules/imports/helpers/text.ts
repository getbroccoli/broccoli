import { z } from "zod";

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

const email = z.email();
