import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { PermissionProfile } from "../../../core/security";
import type { EmployeeUseCases } from "../app";
import type { Employee } from "../domain";

/** One request's loaders for employee data. */
export interface EmployeeLoaders {
  /** An employee's manager today, or null without one. */
  manager: DataLoader<string, Employee | null>;
  /** The profiles of the user who signs in as an employee, or null without one. */
  permissionProfiles: DataLoader<string, PermissionProfile[] | null>;
}

/** One request's loaders: related data in one query per list, not one per item. Create once, in `createResolvers`. */
export function employeeLoaders(
  useCases: EmployeeUseCases,
): (context: GraphqlContext) => EmployeeLoaders {
  return perRequest((context) => ({
    manager: new DataLoader<string, Employee | null>(async (employeeIds) => {
      const managers = await useCases.readManagers(context.getActor(), employeeIds);
      return employeeIds.map((id) => managers.get(id) ?? null);
    }),
    permissionProfiles: new DataLoader<string, PermissionProfile[] | null>(async (employeeIds) => {
      const profiles = await useCases.readPermissionProfiles(context.getActor(), employeeIds);
      return employeeIds.map((id) => profiles.get(id) ?? null);
    }),
  }));
}
