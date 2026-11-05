/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // Settings reads only what is asked for: the list, or one type for its panel.
  TimeOffSettings: "Record<PropertyKey, never>",
};
