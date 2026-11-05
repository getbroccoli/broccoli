/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // Settings reads only what is asked for: the list, or one type for its panel.
  TimeOffSettings: "Record<PropertyKey, never>",
  // A mutation namespace holds no data; its field resolves to an empty object.
  TimeOffTypeMutations: "Record<PropertyKey, never>",
  TimeOffType: "../../modules/timeOff/domain#TimeOffType as TimeOffTypeModel",
};
