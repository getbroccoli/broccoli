import { toEnum } from "../../../core/graphql";
import type { PatternWeek } from "../domain";

/** A week's fields as GraphQL shows them: each weekday's minutes, the calendar in capitals. */
export const WEEK_FIELDS = {
  mondayMinutes: ({ minutes }: PatternWeek) => minutes[0],
  tuesdayMinutes: ({ minutes }: PatternWeek) => minutes[1],
  wednesdayMinutes: ({ minutes }: PatternWeek) => minutes[2],
  thursdayMinutes: ({ minutes }: PatternWeek) => minutes[3],
  fridayMinutes: ({ minutes }: PatternWeek) => minutes[4],
  saturdayMinutes: ({ minutes }: PatternWeek) => minutes[5],
  sundayMinutes: ({ minutes }: PatternWeek) => minutes[6],
  bankHolidayCalendar: ({ bankHolidayCalendar }: PatternWeek) => toEnum(bankHolidayCalendar),
};
