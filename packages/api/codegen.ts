import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/modules/**/*.graphql",
  generates: {
    "src/core/graphql/resolvers.gen.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: { useTypeImports: true, strictScalars: true, enumsAsTypes: true },
    },
  },
};

export default config;
