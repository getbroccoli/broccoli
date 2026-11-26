import { t } from "@/i18n";

const dayCount = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** A number of days as words, such as "1 day" or "2.5 days". */
export function formatDays(days: number): string {
  return t(days === 1 ? "app.day" : "app.days", { count: formatDayCount(days) });
}

/** A number of days alone, to two decimals at most: "28", "22.5", "7.25". */
export function formatDayCount(days: number): string {
  return dayCount.format(days);
}
