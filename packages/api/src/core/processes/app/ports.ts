import type { Tx } from "../../db";
import type { CalendarDate } from "../../../utils";
import type { IsWorkingDay } from "../domain";

/** A person as a run needs them: whom it is about, or a step's assignee. */
export interface RunSubject {
  id: string;
  firstName: string;
  /** Their first employment's start. */
  startDate: CalendarDate | null;
}

/** What a run needs about people, read in the run's transaction; the employees module fills it. */
export interface PeoplePort {
  /** The people among these ids that exist, by id. */
  readPeople(tx: Tx, employeeIds: readonly string[]): Promise<Map<string, RunSubject>>;
  /** Each person's direct manager on this day; people without one are left out. */
  readManagersOn(
    tx: Tx,
    input: { employeeIds: readonly string[]; date: CalendarDate },
  ): Promise<Map<string, string>>;
  /** The owner's employee, or null. */
  readOwner(tx: Tx): Promise<string | null>;
}

/** People's working days, for steps due in business days; the employees module fills it. */
export interface WorkingCalendarsPort {
  /**
   * Each person's working days around these days, refusing a day whose working calendar is
   * unknown; null for a person on no terms, whose offsets count calendar days.
   */
  readWorkingDays(
    tx: Tx,
    input: { employeeIds: readonly string[]; days: readonly CalendarDate[] },
  ): Promise<Map<string, IsWorkingDay | null>>;
}
