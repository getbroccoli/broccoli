import { t } from "@/i18n";

const dayCount = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** A number of days as words, such as "1 day" or "2.5 days". */
export function formatDays(days: number): string {
  return t(days === 1 ? "app.day" : "app.days", { count: dayCount.format(days) });
}
