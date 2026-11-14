import { readSdl } from "../graphql";
import type { ModuleDependencies, ModuleManifest } from "../moduleManifest";
import { taskRecordType, type TaskService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createTaskService, taskRecordType } from "./app";

// Public types.
export type { NewTask, TaskService } from "./app";
export { MANUAL_TO_DO } from "./domain";
export type { Task, TaskStatus } from "./domain";

/** Work asked of people, and each person's My tasks. */
export function tasksModule({
  orm,
  tasks,
}: Pick<ModuleDependencies, "orm"> & { tasks: TaskService }): ModuleManifest {
  return {
    name: "tasks",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(tasks),
    recordTypes: { task: taskRecordType(orm) },
  };
}
