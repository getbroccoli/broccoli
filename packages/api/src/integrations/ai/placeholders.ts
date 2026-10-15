import type { Json, JsonObject } from "./decisions";

/**
 * A copy of `state` where every string that could identify someone is replaced by a
 * placeholder of the same form; keys and structure stay. Deny by default: a string
 * passes as itself only when it is blank or a boolean; inside one, heading and job words stay.
 */
export function withPlaceholders(state: JsonObject): JsonObject {
  const strings = collectStrings(state);
  const emailDomains = countOf(strings.flatMap(tokensOf).filter(isEmail).map(domainOf));
  const emailNumbers = new Map<string, number>();
  const rewrite = (value: string): string => {
    if (passesAsItself(value)) {
      return value;
    }
    return tokensOf(value)
      .map((token) =>
        isEmail(token)
          ? emailPlaceholder(token, emailNumbers, emailDomains)
          : wordPlaceholder(token),
      )
      .join("");
  };
  return mapStrings(state, rewrite) as JsonObject;
}

/** An email domain shared by this many addresses is the company's, not a person's. */
const MIN_SHARED = 3;

const BOOLEANS = new Set("yes no true false y n x ja nein oui non sí".split(" "));

const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "t-online.de",
  "proton.me",
  "protonmail.com",
]);

/** Words of staff-file headings and job titles, without those that are also common surnames. */
const HEADING_WORDS = new Set(
  [
    // English
    "name names first last given family middle full display preferred known as surname forename",
    "forenames email e-mail mail work business personal private phone mobile telephone tel number",
    "no job title position role department dept team manager start started joined hire hired entry",
    "date end leaving left birth born birthday dob next of kin address street city postcode zip",
    "country employee staff id ni payroll location office status type contract salary notes note",
    "emergency contact",
    // German
    "vorname nachname familienname telefon telefonnummer handy mobilnummer stelle titel abteilung",
    "eintritt eintrittsdatum austritt austrittsdatum geburtsdatum geburtstag adresse straße ort plz",
    "land mitarbeiter mitarbeiterin personalnummer vorgesetzter notizen datum",
    // French
    "nom prénom courriel téléphone poste fonction service département embauche naissance ville pays",
    "salarié employé d'embauche",
    // Spanish
    "nombre apellido apellidos correo electrónico teléfono móvil puesto cargo departamento fecha",
    "inicio ingreso nacimiento dirección empleado",
    // Dutch
    "voornaam achternaam naam telefoonnummer functie afdeling geboortedatum indiensttreding adres",
    "medewerker werknemer",
    // Job titles, without surnames such as Baker, Cook, Mason, Sales, Senior, Taylor
    "administrator technician adviser advisor assistant officer coordinator director developer",
    "designer engineer accountant analyst consultant specialist supervisor executive",
    "representative receptionist recruiter bookkeeper administration marketing maintenance",
    "support finance accounts customer operations it hr research junior chief office",
    "entwickler entwicklerin designerin buchhalter buchhalterin leiter leiterin",
  ].flatMap((line) => line.split(" ")),
);

function collectStrings(value: Json): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectStrings);
}

function mapStrings(value: Json, rewrite: (value: string) => string): Json {
  if (typeof value === "string") {
    return rewrite(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapStrings(item, rewrite));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, mapStrings(item, rewrite)]),
  );
}

function countOf(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function passesAsItself(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || BOOLEANS.has(trimmed.toLowerCase());
}

/** Words and the whitespace between them, so joining them gives the value back. */
function tokensOf(value: string): string[] {
  return value.split(/(\s+)/);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(token: string): boolean {
  return EMAIL.test(token);
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** `person<N>@<domain>`, N by distinct email; the domain stays only when it names no one. */
function emailPlaceholder(
  email: string,
  numbers: Map<string, number>,
  domains: Map<string, number>,
): string {
  const key = email.toLowerCase();
  if (!numbers.has(key)) {
    numbers.set(key, numbers.size + 1);
  }
  const domain = domainOf(email);
  const sharedDomain = (domains.get(domain) ?? 0) >= MIN_SHARED || PUBLIC_MAIL_DOMAINS.has(domain);
  return `person${numbers.get(key)}@${sharedDomain ? domain : "example.com"}`;
}

const DATE = /^\d+([./-])\d+(\1\d+)?$/;
const YEAR = /^(19|20)\d\d$/;

/** A heading word as it is, a date with only its year, anything else as its shape. */
function wordPlaceholder(token: string): string {
  if (/^\s*$/.test(token) || isHeadingWord(token)) {
    return token;
  }
  if (DATE.test(token) && token.split(/[./-]/).some((part) => YEAR.test(part))) {
    return token.replace(/\d+/g, (part) => (YEAR.test(part) ? part : shapeOf(part)));
  }
  return shapeOf(token);
}

function isHeadingWord(token: string): boolean {
  // Only punctuation may surround the word: a digit or symbol next to it can be data.
  const word = token.replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase();
  return HEADING_WORDS.has(word);
}

/** Upper-case letter → X, other letter → x, digit → d; everything else stays. */
function shapeOf(text: string): string {
  return text.replace(/[\p{L}\p{M}\p{N}]/gu, (char) =>
    /\p{N}/u.test(char) ? "d" : /\p{Lu}/u.test(char) ? "X" : "x",
  );
}
