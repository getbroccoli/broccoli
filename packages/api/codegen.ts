import type { CodegenConfig } from "@graphql-codegen/cli";

import { codegenMappers as importMappers } from "./src/modules/imports/codegen";

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
        // Each module owns its mappers; they meet only in this one generated file.
        mappers: {
          ...importMappers,
        },
      },
    },
  },
};

export default config;
