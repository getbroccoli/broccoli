import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createEmployeeUseCases } from "./app";
import { createResolvers } from "./graphql";
import { avatarRouter } from "./http";

// Public values.
export {
  createDemoEmployees,
  createEmployeeUseCases,
  createImportedEmployees,
  deleteAllEmployees,
  findEmployeesWithAvatars,
  findTakenEmails,
  hasDemoEmployees,
} from "./app";
export { employeeFieldErrors, parseEmployeeField } from "./domain";

// Public types.
export type {
  Employee,
  EmployeeOrder,
  EmployeeOrderField,
  NewEmployee,
  NewEmployeeInput,
} from "./domain";

/** The people who work for the company: create and list them, and serve their avatars. */
export function employeesModule({ orm }: Pick<ModuleDependencies, "orm">): ModuleManifest {
  const useCases = createEmployeeUseCases({ orm });
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    router: (resolveSecurity) => avatarRouter(useCases, resolveSecurity),
  };
}
