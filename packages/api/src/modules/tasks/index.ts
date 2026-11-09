import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import type { EmployeeReadService } from "../employees";
import type { TaskService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createTaskService } from "./app";

// Public types.
export type { NewTask, TaskService } from "./app";

/** Work asked of people, and each person's My tasks. */
export function tasksModule({
  tasks,
  employees,
}: {
  tasks: TaskService;
  employees: Pick<EmployeeReadService, "readEmployees">;
}): ModuleManifest {
  return {
    name: "tasks",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(tasks, employees),
  };
}
