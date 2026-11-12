/** A `YYYY-MM-DD` date that falls on a Saturday or Sunday. */
export function isWeekend(date: string): boolean {
  const day = new Date(Date.parse(date)).getUTCDay();
  return day === 0 || day === 6;
}

// The calendar works in local dates, so the day never shifts with the time zone.
export function toDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

export function toCalendarDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
