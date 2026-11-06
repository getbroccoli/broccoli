import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { PermissionProfile } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import type {
  EmployeeInviteService,
  EmployeeManagerService,
  EmployeePermissionService,
  EmployeeReadService,
  LocationService,
  LocationWithPeopleCount,
  TermsOverview,
  TermsService,
} from "../app";
import type { Employee, SignInStatus } from "../domain";

/** One request's loaders for employee data. */
export interface EmployeeLoaders {
  /** An employee's manager today, or null without one. */
  manager: DataLoader<string, Employee | null>;
  /** An employee's start date: the start of their first employment. */
  startDate: DataLoader<string, CalendarDate | null>;
  /** The profiles of the user who signs in as an employee, or null without one. */
  permissionProfiles: DataLoader<string, PermissionProfile[] | null>;
  /** Whether a person can sign in, and their invite. */
  signInStatus: DataLoader<string, SignInStatus | null>;
  /** A location by id; every location is read once per request, since a company has few. */
  location: DataLoader<string, LocationWithPeopleCount | null>;
  /**
   * A set of terms by id, or the default terms by `DEFAULT_TERMS`; every set is read once per
   * request, since a company has few. Admins only.
   */
  terms: DataLoader<string, TermsOverview | null>;
}

/** The `terms` loader's key for the default terms, which a location without terms starts people on. */
export const DEFAULT_TERMS = "default";

/** One request's loaders: related data in one query per list, not one per item. Create once, in `createResolvers`. */
export function employeeLoaders(
  services: EmployeeReadService &
    EmployeeManagerService &
    EmployeePermissionService &
    LocationService &
    TermsService,
  invites: EmployeeInviteService,
): (context: GraphqlContext) => EmployeeLoaders {
  return perRequest((context) => ({
    manager: new DataLoader<string, Employee | null>(async (employeeIds) => {
      const managers = await services.readManagers(context.getActor(), employeeIds);
      return employeeIds.map((id) => managers.get(id) ?? null);
    }),
    startDate: new DataLoader<string, CalendarDate | null>(async (employeeIds) => {
      const startDates = await services.readStartDates(context.getActor(), employeeIds);
      return employeeIds.map((id) => startDates.get(id) ?? null);
    }),
    permissionProfiles: new DataLoader<string, PermissionProfile[] | null>(async (employeeIds) => {
      const profiles = await services.readPermissionProfiles(context.getActor(), employeeIds);
      return employeeIds.map((id) => profiles.get(id) ?? null);
    }),
    signInStatus: new DataLoader<string, SignInStatus | null>(async (employeeIds) => {
      const statuses = await invites.readStatuses(context.getActor(), employeeIds);
      return employeeIds.map((id) => statuses.get(id) ?? null);
    }),
    location: new DataLoader<string, LocationWithPeopleCount | null>(async (locationIds) => {
      const locations = await services.listLocations(context.getActor());
      return locationIds.map((id) => locations.find((location) => location.id === id) ?? null);
    }),
    terms: new DataLoader<string, TermsOverview | null>(async (keys) => {
      const allTerms = await services.listTerms(context.getActor());
      return keys.map(
        (key) =>
          allTerms.find((terms) => (key === DEFAULT_TERMS ? terms.isDefault : terms.id === key)) ??
          null,
      );
    }),
  }));
}
