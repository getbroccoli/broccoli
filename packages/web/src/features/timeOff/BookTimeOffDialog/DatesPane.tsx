import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";

import { toCalendarDate, toDate } from "./calendarDates";
import type { BookingDraft } from "./useBookingDraft";

type Props = {
  draft: BookingDraft;
  window: { from: string; until: string };
};

/** Two months to pick the first and last day; days outside the booking window are off. */
export function DatesPane({ draft, window }: Props) {
  const selected = draft.range && { from: toDate(draft.range.from), to: toDate(draft.range.until) };
  return (
    <Calendar
      mode="range"
      numberOfMonths={2}
      selected={selected ?? undefined}
      defaultMonth={selected?.from}
      disabled={[{ before: toDate(window.from) }, { after: toDate(window.until) }]}
      onSelect={(range: DateRange | undefined) =>
        draft.setRange(
          range?.from
            ? { from: toCalendarDate(range.from), until: toCalendarDate(range.to ?? range.from) }
            : null,
        )
      }
    />
  );
}
