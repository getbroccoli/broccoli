import { type CalendarDate, addDays } from "../../../utils";
import type { NewEmployeeInput } from "../../employees";
import { DEMO_PEOPLE } from "./demoCompany";

/** A demo employee, the key that names their avatar, their manager's email and their location. */
export interface DemoPerson {
  key: string;
  employee: NewEmployeeInput;
  managerEmail: string | null;
  locationName: string;
}

/** The demo company's people, with start dates counted from `today`. */
export function demoPeople(today: CalendarDate): DemoPerson[] {
  return DEMO_PEOPLE.map(
    ({ firstName, lastName, jobTitle = null, manager, startedDaysAgo }, index) => ({
      key: `${firstName}-${lastName}`.toLowerCase(),
      employee: {
        firstName,
        lastName,
        email: emailOf(`${firstName} ${lastName}`),
        jobTitle,
        startDate: startedDaysAgo === undefined ? null : addDays(today, -startedDaysAgo),
      },
      managerEmail: manager === undefined ? null : emailOf(manager),
      locationName: DEMO_LOCATIONS[index % DEMO_LOCATIONS.length]!,
    }),
  );
}

/** The demo company's offices, handed out in turn so each has people. */
const DEMO_LOCATIONS = ["London", "Manchester", "Remote"];

function emailOf(fullName: string): string {
  return `${fullName.replace(" ", ".")}@example.com`.toLowerCase();
}
