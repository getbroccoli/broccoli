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
        mappers: { EmployeeMutations: "Record<PropertyKey, never>" },
      },
    },
  },
};

export default config;
