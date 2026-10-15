import { invalidInput } from "../applicationError";

const SEARCH_MAX_LENGTH = 100;

/** A list's search text, trimmed, or null when blank; refused over 100 characters. */
export function parseSearch(search: string | null | undefined): string | null {
  const trimmed = search?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > SEARCH_MAX_LENGTH) {
    throw invalidInput([{ field: "search", code: "too_long" }]);
  }
  return trimmed;
}
