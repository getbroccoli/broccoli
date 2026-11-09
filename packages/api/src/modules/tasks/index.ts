import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import type { EmployeeReadService } from "../employees";
import { taskRecordType, type TaskService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createTaskService } from "./app";

// Public types.
export type { NewTask, TaskService } from "./app";

/** Work asked of people, and each person's My tasks. */
export function tasksModule({
  orm,
  tasks,
  employees,
}: Pick<ModuleDependencies, "orm"> & {
  tasks: TaskService;
  employees: Pick<EmployeeReadService, "readEmployees">;
}): ModuleManifest {
  return {
    name: "tasks",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(tasks, employees),
    recordTypes: { task: taskRecordType(orm) },
  };
}
