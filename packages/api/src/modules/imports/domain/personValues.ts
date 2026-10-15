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

type PersonName = Pick<ImportEmployeeValues, "firstName" | "lastName">;

/**
 * A full name split where the split is certain: two Latin words, or a Cyrillic name with a
 * patronymic. Any other name stays whole in `firstName` for the owner to check.
 */
export function splitFullName(fullName: string): PersonName {
  const words = fullName.trim().split(/\s+/);
  if (words.length === 2 && words.every((word) => LATIN_WORD.test(word))) {
    return { firstName: words[0]!, lastName: words[1]! };
  }
  if (words.length === 3 && words.every((word) => CYRILLIC_WORD.test(word))) {
    const [first, second, third] = words as [string, string, string];
    if (PATRONYMIC.test(third)) {
      return { firstName: `${second} ${third}`, lastName: first };
    }
    if (PATRONYMIC.test(second)) {
      return { firstName: `${first} ${second}`, lastName: third };
    }
  }
  return { firstName: words.join(" "), lastName: null };
}

/**
 * A column of full names, read as `Family, Given` when every filled cell has one comma
 * between two parts, else name by name.
 */
export function splitFullNames(fullNames: readonly (string | null)[]): PersonName[] {
  const filled = fullNames.map((name) => nonBlank(name ?? undefined));
  const commaForm = filled.every((name) => name === null || COMMA_NAME.test(name));
  return filled.map((name) => {
    if (name === null) {
      return { firstName: null, lastName: null };
    }
    if (!commaForm) {
      return splitFullName(name);
    }
    const [family, given] = name.split(",") as [string, string];
    return { firstName: given.trim(), lastName: family.trim() };
  });
}

const LATIN_WORD = /^[\p{Script=Latin}'’-]+$/u;
const CYRILLIC_WORD = /^[\p{Script=Cyrillic}-]+$/u;
/** Russian, Ukrainian and Belarusian patronymic endings, such as Ильич or Іванівна. */
const PATRONYMIC = /(ич|ична|овна|евна|івна|ївна|віч|ўна)$/iu;
const COMMA_NAME = /^[^,]*[^\s,][^,]*,[^,]*[^\s,][^,]*$/;

const email = z.email();
