/** A moment as "12 Nov, 14:25". */
export function dateAndTime(dateTime: string): string {
  return DATE_AND_TIME.format(new Date(dateTime));
}

const DATE_AND_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
