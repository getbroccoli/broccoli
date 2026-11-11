/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  TimeOffMutations: "Record<PropertyKey, never>",
  UnpublishedTimeOffRules: "../../modules/timeOff/domain#PolicyVersion as UnpublishedTimeOffRulesModel",
  TimeOffWithPolicies: "../../modules/timeOff/app#TimeOffWithPolicies as TimeOffWithPoliciesModel",
  PersonTimeOff: "../../modules/timeOff/app#PersonTimeOff as PersonTimeOffModel",
};
