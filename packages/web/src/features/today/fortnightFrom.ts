import { addDays } from "@/lib/calendarDay";

/** The days Today looks ahead: from `today` to 13 days later, both included. */
export function fortnightFrom(today: string): { from: string; until: string } {
  return { from: today, until: addDays(today, 13) };
}
