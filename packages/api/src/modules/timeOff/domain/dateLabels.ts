import { type CalendarDate, weekdayOf } from "../../../utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A day as people read it in a sentence: "Wed 9 Dec". */
export function dayLabel(date: CalendarDate): string {
  return `${WEEKDAYS[weekdayOf(date)]} ${parts(date).day} ${parts(date).month}`;
}

/** A range as the calendar shows it: "7–9 Dec", "30 Nov – 2 Dec", "30 Dec 2026 – 2 Jan 2027". */
export function dateRangeLabel(first: CalendarDate, last: CalendarDate): string {
  const from = parts(first);
  const to = parts(last);
  if (first === last) return `${to.day} ${to.month}`;
  if (from.year !== to.year) {
    return `${from.day} ${from.month} ${from.year} – ${to.day} ${to.month} ${to.year}`;
  }
  if (from.month !== to.month) return `${from.day} ${from.month} – ${to.day} ${to.month}`;
  return `${from.day}–${to.day} ${to.month}`;
}

function parts(date: CalendarDate) {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year!, month: MONTHS[month! - 1]!, day: day! };
}
