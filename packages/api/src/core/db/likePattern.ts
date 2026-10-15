/** An `ilike` pattern matching text that contains `search`, its wildcards taken literally. */
export function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
