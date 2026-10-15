/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  ImportMutations: "Record<PropertyKey, never>",
  // The import has one fixed id; its fields load what they need.
  Import: "Record<PropertyKey, never>",
  ImportSource: "../../modules/imports/domain#ImportSource as ImportSourceModel",
  ImportEmployee: "../../modules/imports/domain#ImportEmployee as ImportEmployeeModel",
};
