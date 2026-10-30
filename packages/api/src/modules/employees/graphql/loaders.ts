import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { PermissionProfile } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import type { EmployeeInviteService, EmployeeUseCases } from "../app";
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
}

/** One request's loaders: related data in one query per list, not one per item. Create once, in `createResolvers`. */
export function employeeLoaders(
  useCases: EmployeeUseCases,
  invites: EmployeeInviteService,
): (context: GraphqlContext) => EmployeeLoaders {
  return perRequest((context) => ({
    manager: new DataLoader<string, Employee | null>(async (employeeIds) => {
      const managers = await useCases.readManagers(context.getActor(), employeeIds);
      return employeeIds.map((id) => managers.get(id) ?? null);
    }),
    startDate: new DataLoader<string, CalendarDate | null>(async (employeeIds) => {
      const startDates = await useCases.readStartDates(context.getActor(), employeeIds);
      return employeeIds.map((id) => startDates.get(id) ?? null);
    }),
    permissionProfiles: new DataLoader<string, PermissionProfile[] | null>(async (employeeIds) => {
      const profiles = await useCases.readPermissionProfiles(context.getActor(), employeeIds);
      return employeeIds.map((id) => profiles.get(id) ?? null);
    }),
    signInStatus: new DataLoader<string, SignInStatus | null>(async (employeeIds) => {
      const statuses = await invites.readStatuses(context.getActor(), employeeIds);
      return employeeIds.map((id) => statuses.get(id) ?? null);
    }),
  }));
}
