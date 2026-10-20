import commonNames from "./words/commonNames.json" with { type: "json" };
import de from "./words/de.json" with { type: "json" };
import en from "./words/en.json" with { type: "json" };
import es from "./words/es.json" with { type: "json" };
import fr from "./words/fr.json" with { type: "json" };
import nl from "./words/nl.json" with { type: "json" };

/**
 * Which word list a lower-case word is on: a common name first, since such a word may also be a
 * job or heading word; null for none. The lists stay here, so no caller holds them.
 */
export function vocabularyCategory(word: string): "name" | "job" | "heading" | null {
  if (NAMES.has(word)) return "name";
  if (JOB_WORDS.has(word)) return "job";
  return HEADING_WORDS.has(word) ? "heading" : null;
}

const LANGUAGES = [de, en, es, fr, nl];
const NAMES = new Set(commonNames);
const JOB_WORDS = new Set(LANGUAGES.flatMap(({ jobTitles }) => jobTitles));
const HEADING_WORDS = new Set(LANGUAGES.flatMap(({ headings }) => headings));
