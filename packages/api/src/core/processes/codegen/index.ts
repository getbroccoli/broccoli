/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  TaskProcessRun: "../processes/app#StepProgress as StepProgressModel",
  ProcessRunOutcome: "../processes/app#RunOutcome as RunOutcomeModel",
};
