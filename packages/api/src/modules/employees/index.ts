import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/module-manifest";
import { createEmployee } from "./app/create-employee";
import { listEmployees } from "./app/list-employees";
import { createEmployeeRepository } from "./db/employee-repository";
import { createResolvers } from "./graphql/resolvers";

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
