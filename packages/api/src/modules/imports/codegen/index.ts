/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // The import has one fixed id; its fields load what they need.
  Import: "Record<PropertyKey, never>",
  ImportSource: "../../modules/imports/domain#ImportSource as ImportSourceModel",
  ImportEmployee: "../../modules/imports/domain#ImportEmployee as ImportEmployeeModel",
  ImportEmployeeRecord:
    "../../modules/imports/domain#ImportEmployeeRecord as ImportEmployeeRecordModel",
  ImportCheck: "../../modules/imports/domain#ImportCheck as ImportCheckModel",
};
