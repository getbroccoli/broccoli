import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createEmployeeUseCases } from "./app";
import { createResolvers } from "./graphql";
import { avatarRouter } from "./http";

export {
  createDemoEmployees,
  createEmployeeUseCases,
  createImportedEmployees,
  deleteAllEmployees,
  findTakenEmails,
  hasDemoEmployees,
} from "./app";
export {
  employeeFieldErrors,
  parseEmployeeField,
  type Employee,
  type EmployeeOrder,
  type EmployeeOrderField,
  type NewEmployee,
  type NewEmployeeInput,
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
