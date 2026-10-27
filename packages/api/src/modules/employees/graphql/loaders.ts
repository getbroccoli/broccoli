import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { EmployeeUseCases } from "../app";
import type { Employee } from "../domain";

/** One request's loaders for employee data. */
export interface EmployeeLoaders {
  /** An employee's manager today, or null without one. */
  manager: DataLoader<string, Employee | null>;
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
  }));
}
