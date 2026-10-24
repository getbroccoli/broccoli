import { t } from "@/i18n";

import { calendarDayParts } from "./calendarDay";

/** How long someone has worked here, from two `YYYY-MM-DD` days: "1 yr 9 mo", or when they start. */
export function tenureOf(startDate: string | null, today: string): string | null {
  if (!startDate) return null;
  const start = calendarDayParts(startDate);
  const now = calendarDayParts(today);
  if (startDate >= today) {
    const days = (Date.UTC(...start) - Date.UTC(...now)) / DAY_MS;
    if (days === 0) return t("people.panel.tenure.startsToday");
    return t(days === 1 ? "people.panel.tenure.startsInDay" : "people.panel.tenure.startsInDays", {
      count: String(days),
    });
  }
  const months = (now[0] - start[0]) * 12 + (now[1] - start[1]) - (now[2] < start[2] ? 1 : 0);
  if (months === 0) return t("people.panel.tenure.underAMonth");
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years > 0 &&
      t(years === 1 ? "people.panel.tenure.year" : "people.panel.tenure.years", {
        count: String(years),
      }),
    rest > 0 && t("people.panel.tenure.months", { count: String(rest) }),
  ];
  return parts.filter(Boolean).join(" ");
}

const DAY_MS = 24 * 60 * 60 * 1000;
