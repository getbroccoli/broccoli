const relativeTime = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/** A past moment as "12 seconds ago" or "yesterday", in the largest unit that fits. */
export function timeAgo(dateTime: string): string {
  const seconds = Math.round((new Date(dateTime).getTime() - Date.now()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return relativeTime.format(0, "second");
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];
