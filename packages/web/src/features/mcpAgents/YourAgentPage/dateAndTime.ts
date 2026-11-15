const dateAndTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** A moment as "12 Nov, 14:25". */
export function dateAndTimeOf(dateTime: string): string {
  return dateAndTime.format(new Date(dateTime));
}
