import { addDays, type CalendarDate } from "../../../utils";
import { addDayOffset } from "./dayOffset";
import type { RecordDateTrigger } from "./processDefinition";

/**
 * The date a record's date triggers a run on, if that is from the later of the day the process was
 * turned on and `maxDaysLate` days ago, to today; null otherwise.
 */
export function dueTriggerDate(
  trigger: RecordDateTrigger,
  recordDate: CalendarDate,
  { today, turnedOnDay }: { today: CalendarDate; turnedOnDay: CalendarDate },
): CalendarDate | null {
  const lateBy = addDays(today, -trigger.maxDaysLate);
  const earliest = turnedOnDay > lateBy ? turnedOnDay : lateBy;
  // shortcut: a trigger offset counts calendar days here; count the person's business days when a ready-made process needs them.
  const triggerDate = addDayOffset(recordDate, trigger.offset, null);
  return triggerDate >= earliest && triggerDate <= today ? triggerDate : null;
}
