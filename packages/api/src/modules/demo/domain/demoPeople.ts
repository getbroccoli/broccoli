import { type CalendarDate, addDays } from "../../../utils";
import type { NewEmployeeInput } from "../../employees";
import { DEMO_PEOPLE } from "./demoCompany";

/** A demo employee, the key that names their avatar and their manager's email. */
export interface DemoPerson {
  key: string;
  employee: NewEmployeeInput;
  managerEmail: string | null;
}

/** The demo company's people, with start dates counted from `today`. */
export function demoPeople(today: CalendarDate): DemoPerson[] {
  return DEMO_PEOPLE.map(({ firstName, lastName, jobTitle = null, manager, startedDaysAgo }) => ({
    key: `${firstName}-${lastName}`.toLowerCase(),
    employee: {
      firstName,
      lastName,
      email: emailOf(`${firstName} ${lastName}`),
      jobTitle,
      startDate: startedDaysAgo === undefined ? null : addDays(today, -startedDaysAgo),
    },
    managerEmail: manager === undefined ? null : emailOf(manager),
  }));
}

function emailOf(fullName: string): string {
  return `${fullName.replace(" ", ".")}@example.com`.toLowerCase();
}
