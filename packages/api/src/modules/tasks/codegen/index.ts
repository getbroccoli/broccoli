/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  TasksMutations: "Record<PropertyKey, never>",
  Task: "../../modules/tasks/domain#Task as TaskModel",
  MyTasks: "../../modules/tasks/domain#MyTasks as MyTasksModel",
};
