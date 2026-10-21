/** The trimmed text, or null when it is missing or blank. */
export function nonBlank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
