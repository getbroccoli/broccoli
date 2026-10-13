import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/**/*.graphql",
  generates: {
    "src/core/graphql/resolvers.gen.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        useTypeImports: true,
        strictScalars: true,
        enumsAsTypes: true,
        scalars: { Date: "string", DateTime: "Date" },
        contextType: "./apollo#GraphqlContext",
        // A mutation namespace holds no data; its field resolves to an empty object.
        mappers: {
          EmployeeMutations: "Record<PropertyKey, never>",
          CompanyMutations: "Record<PropertyKey, never>",
          DemoMutations: "Record<PropertyKey, never>",
          ImportMutations: "Record<PropertyKey, never>",
          // The import has one fixed id; its fields load what they need.
          Import: "Record<PropertyKey, never>",
          ImportSource: "../../modules/imports/domain#ImportSource as ImportSourceModel",
          ImportEmployee: "../../modules/imports/domain#ImportEmployee as ImportEmployeeModel",
        },
      },
    },
  },
};

export default config;
