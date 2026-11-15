/** The part of the day at `now`, by local time, for the greeting on Today. */
export function partOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  return hour < 18 ? "afternoon" : "evening";
}
