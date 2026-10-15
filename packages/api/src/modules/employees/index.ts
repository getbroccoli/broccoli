import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createEmployeeUseCases } from "./app";
import { createResolvers } from "./graphql";
import { avatarRouter } from "./http";

export {
  clearDemoEmployees,
  createDemoEmployees,
  createEmployeeUseCases,
  createImportedEmployees,
  hasDemoEmployees,
  hasEmployees,
  type DemoEmployee,
  type EmployeeUseCases,
} from "./app";
/** For test seeding only; other modules go through the use cases. */
export { employeeRepository } from "./db";
export {
  employeeFieldErrors,
  tryParseNewEmployee,
  type Employee,
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
    router: (resolveSecurity) => avatarRouter(useCases, resolveSecurity, orm),
  };
}
