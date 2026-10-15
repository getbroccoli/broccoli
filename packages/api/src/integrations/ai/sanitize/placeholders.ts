import type { Json, JsonObject } from "../decisions";
import de from "./words/de.json" with { type: "json" };
import en from "./words/en.json" with { type: "json" };
import es from "./words/es.json" with { type: "json" };
import fr from "./words/fr.json" with { type: "json" };
import nl from "./words/nl.json" with { type: "json" };

/**
 * A copy of `state` where every string that could identify someone is replaced by a
 * placeholder of the same form; keys and structure stay. Deny by default: a string
 * passes as itself only when it is blank or a boolean; inside one, heading and job words stay.
 */
export function withPlaceholders(state: JsonObject): JsonObject {
  const strings = collectStrings(state);
  const emails = new Set(
    strings
      .flatMap(tokensOf)
      .filter(isEmail)
      .map((email) => email.toLowerCase()),
  );
  const emailDomains = countOf([...emails].map(domainOf));
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

/** An email domain shared by this many distinct addresses is the company's, not a person's. */
const MIN_SHARED = 3;

/**
 * Per language, lower case: booleans pass whole; heading and job-title words pass inside a
 * value. Never a word that is also a common name, such as Baker, Cook, Mason or Sales.
 */
const LANGUAGES = [de, en, es, fr, nl];

const BOOLEANS = new Set(LANGUAGES.flatMap(({ booleans }) => booleans));

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

const HEADING_WORDS = new Set(
  LANGUAGES.flatMap(({ headings, jobTitles }) => [...headings, ...jobTitles]),
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
