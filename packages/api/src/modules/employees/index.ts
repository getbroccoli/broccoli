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
export type { ImportedEmployees } from "./app";
export type {
  Employee,
  EmployeeOrder,
  EmployeeOrderField,
  NewEmployee,
  NewEmployeeInput,
} from "./domain";

/** The people who work for the company: create, change, remove and list them, keep their history, and serve their avatars. */
export function employeesModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger">,
): ModuleManifest {
  const useCases = createEmployeeUseCases(dependencies);
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    recordHistoryAccess: { employee: (ctx) => ctx.requireOwnerOrSystem() },
    router: (resolveSecurity) => avatarRouter(useCases, resolveSecurity),
  };
}
