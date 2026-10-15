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
 * A full name split given name first, as UK staff lists write it: the last word, with any
 * particles before it (`van der Meer`), is the surname. A Cyrillic name with a patronymic
 * is read in either order. Any other name stays whole in `firstName` for the owner to check.
 */
export function splitFullName(fullName: string): PersonName {
  const words = withoutTitle(fullName.trim().split(/\s+/));
  if (words.length > 1 && words.every((word) => LATIN_WORD.test(word) && !NASAB.test(word))) {
    let surnameStart = words.length - 1;
    while (surnameStart > 0 && PARTICLES.has(words[surnameStart - 1]!)) {
      surnameStart--;
    }
    if (surnameStart === 0) {
      // Only particles before the last word: no given name to keep, so they stay in front.
      surnameStart = words.length - 1;
    }
    return {
      firstName: words.slice(0, surnameStart).join(" "),
      lastName: words.slice(surnameStart).join(" "),
    };
  }
  if (words.length === 3 && words.every((word) => CYRILLIC_WORD.test(word))) {
    const [first, second, third] = words as [string, string, string];
    // Two patronymic-like words, such as Ильич Рабинович, leave the order unknown.
    const patronymics = words.filter((word) => PATRONYMIC.test(word)).length;
    if (patronymics === 1 && PATRONYMIC.test(third)) {
      return { firstName: `${second} ${third}`, lastName: first };
    }
    if (patronymics === 1 && PATRONYMIC.test(second)) {
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
  const parts = filled.map((name) => name?.split(",").map((part) => part.trim()));
  const commaForm = parts.every(
    (nameParts) => nameParts === undefined || (nameParts.length === 2 && nameParts.every(Boolean)),
  );
  return filled.map((name, index) => {
    if (name === null) {
      return { firstName: null, lastName: null };
    }
    if (!commaForm) {
      return splitFullName(name);
    }
    const [family, given] = parts[index] as [string, string];
    return { firstName: given, lastName: family };
  });
}

/** Drops a leading title such as `Mr` or `Dr.` when a name follows it. */
function withoutTitle(words: string[]): string[] {
  return words.length > 1 && TITLE.test(words[0]!) ? words.slice(1) : words;
}

const TITLE = /^(mr|mrs|ms|miss|mx|dr|prof)\.?$/i;
/** Lowercase surname particles, as in van der Meer or de la Fontaine. */
const PARTICLES = new Set([
  "van",
  "der",
  "den",
  "de",
  "la",
  "le",
  "du",
  "da",
  "das",
  "do",
  "dos",
  "von",
  "di",
  "del",
  "della",
]);
/** `bin`, `binti`: a name that names its father, with no family name. */
const NASAB = /^(bin|binti|bint|ibn)$/i;
const LATIN_WORD = /^[\p{Script=Latin}'’-]+$/u;
const CYRILLIC_WORD = /^[\p{Script=Cyrillic}-]+$/u;
/** Russian, Ukrainian and Belarusian patronymic endings, such as Ильич or Іванівна. */
const PATRONYMIC = /(ич|ична|овна|евна|івна|ївна|віч|ўна)$/iu;

const email = z.email();
