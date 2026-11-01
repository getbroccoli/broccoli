import { useState } from "react";

import { useDebouncedValue } from "@/lib/useDebouncedValue";

/** The search box's text, and the trimmed query to send once typing pauses. */
export function usePersonSearch() {
  const [search, setSearch] = useState("");
  const typed = search.trim().slice(0, SEARCH_MAX_LENGTH);
  const query = useDebouncedValue(typed, DEBOUNCE_MS);
  return { search, setSearch, typed, query };
}

/** The API's longest search. */
const SEARCH_MAX_LENGTH = 100;

/** How long typing pauses before the search runs. */
const DEBOUNCE_MS = 200;
