import { companyToday } from "@/features/termsDisplay";

import { parseMonth } from "./timeOffText";

/** The Time off page's search: the month shown, and a person to open Book time off for. */
export function timeOffSearch(search: Record<string, unknown>): { month: string; book?: string } {
  const book = typeof search.book === "string" ? search.book : undefined;
  return { month: parseMonth(search.month, companyToday()), ...(book ? { book } : {}) };
}
