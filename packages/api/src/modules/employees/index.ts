import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/module-manifest";
import { createEmployeeUseCases } from "./app";
import { createResolvers } from "./graphql";

export { createEmployeeUseCases, type EmployeeUseCases } from "./app";
export type { Employee, NewEmployeeInput } from "./domain";

/** The people who work for the company: create and list them. */
export function employeesModule(dependencies: ModuleDependencies): ModuleManifest {
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(createEmployeeUseCases(dependencies)),
  };
}
