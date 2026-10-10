import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/module-manifest";
import { createEmployee, listEmployees } from "./app";
import { createEmployeeRepository } from "./db";
import { createResolvers } from "./graphql";

/** The people who work for the company: create and list them. */
export function employeesModule({ orm }: ModuleDependencies): ModuleManifest {
  const repository = createEmployeeRepository(orm);
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers({
      createEmployee: (actor, input) => createEmployee(repository, actor, input),
      listEmployees: (actor, page) => listEmployees(repository, actor, page),
    }),
  };
}
