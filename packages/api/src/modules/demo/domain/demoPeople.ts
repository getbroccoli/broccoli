import { type CalendarDate, addDays } from "../../../utils";
import type { NewEmployeeInput } from "../../employees";
import { DEMO_PEOPLE } from "./demoCompany";

/** A demo employee and the key that names their avatar. */
export interface DemoPerson {
  key: string;
  employee: NewEmployeeInput;
}

/** The demo company's people, with start dates counted from `today`. */
export function demoPeople(today: CalendarDate): DemoPerson[] {
  return DEMO_PEOPLE.map(({ firstName, lastName, jobTitle = null, startedDaysAgo }) => ({
    key: `${firstName}-${lastName}`.toLowerCase(),
    employee: {
      firstName,
      lastName,
      email: `${firstName}.${lastName}@example.com`.toLowerCase(),
      jobTitle,
      startDate: startedDaysAgo === undefined ? null : addDays(today, -startedDaysAgo),
    },
  }));
}
