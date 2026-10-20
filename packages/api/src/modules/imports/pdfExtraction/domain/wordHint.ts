import { vocabularyCategory } from "../../../../integrations/ai";
import { casefold } from "./casefold";

/** A generic category for one word: an email, a date's order, a title, a heading or role word. */
export function wordHint(value: string): string {
  const plain = casefold(value.replace(/^[.,:;()[\]{}|/]+|[.,:;()[\]{}|/]+$/gu, ""));
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) return "email";
  if (/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/u.test(value)) return dateHint(value);
  if (/^\p{N}+$/u.test(value)) return "number";
  if (TITLES.has(plain)) return "honorific";
  if (QUALIFICATIONS.has(plain)) return "qualification";
  const heading = HEADER_HINTS[plain];
  if (heading) return heading;
  switch (vocabularyCategory(plain)) {
    case "name":
      return "text";
    case "job":
      return "role_word";
    case "heading":
      return "label_word";
  }
  return ROLE_WORDS.has(plain) ? "role_word" : "text";
}

function dateHint(value: string): string {
  const parts = value.split(/[./-]/u);
  const [first = "", second = ""] = parts;
  const order =
    first.length === 4
      ? "ymd"
      : value.includes(".") || Number(first) > 12
        ? "dmy"
        : Number(second) > 12
          ? "mdy"
          : "unresolved";
  return `date_${order}_${parts.some((part) => part.length === 4) ? "year4" : "year2"}`;
}

const TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "herr",
  "frau",
  "rev",
  "rev’d",
  "rev'd",
  "mx",
  "m",
  "mme",
  "sr",
  "sra",
]);
const QUALIFICATIONS = new Set([
  "ba",
  "ma",
  "bsc",
  "msc",
  "phd",
  "mba",
  "bed",
  "med",
  "pgce",
  "emeritus",
  "emerita",
  "liv",
]);
/** Heading words, in the languages of the staff lists seen, and the category each names. */
const HEADER_HINTS: Record<string, string> = {
  firstname: "given_name_heading",
  vorname: "given_name_heading",
  prénom: "given_name_heading",
  surname: "family_name_heading",
  lastname: "family_name_heading",
  nachname: "family_name_heading",
  nombre: "name_heading",
  name: "name_heading",
  nom: "name_heading",
  nombres: "given_name_heading",
  apellido: "family_name_heading",
  apellidos: "family_name_heading",
  email: "email_heading",
  "e-mail": "email_heading",
  correo: "email_heading",
  position: "role_heading",
  job: "role_heading",
  title: "role_heading",
  cargo: "role_heading",
  puesto: "role_heading",
  beruf: "role_heading",
  tätigkeit: "role_heading",
  funktion: "role_heading",
  entry: "hire_date_heading",
  hire: "hire_date_heading",
  hired: "hire_date_heading",
  eintritt: "hire_date_heading",
  eintrittsdatum: "hire_date_heading",
  start: "hire_date_heading",
  birth: "birth_date_heading",
  birthday: "birth_date_heading",
  geburtstag: "birth_date_heading",
  geburtsdatum: "birth_date_heading",
  phone: "phone_heading",
  telefon: "phone_heading",
  tel: "phone_heading",
  teléfono: "phone_heading",
  department: "department_heading",
  abteilung: "department_heading",
  vacant: "vacancy",
  unbesetzt: "vacancy",
};
/** Role words outside the vocabulary that the research layouts needed. */
const ROLE_WORDS = new Set([
  "chaplain",
  "researcher",
  "leitung",
  "leiter",
  "leiterin",
  "direktor",
  "direktorin",
  "head",
  "datenschutz",
  "gleichstellung",
  "personalrat",
  "vertretung",
  "stellvertretung",
  "vorzimmer",
  "geschäftszimmer",
  "secretary",
  "professor",
  "teacher",
  "lehrkräfte",
]);
