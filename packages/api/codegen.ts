import type { CodegenConfig } from "@graphql-codegen/cli";

import { codegenMappers as companyMappers } from "./src/modules/company/codegen";
import { codegenMappers as demoMappers } from "./src/modules/demo/codegen";
import { codegenMappers as employeeMappers } from "./src/modules/employees/codegen";
import { codegenMappers as externalAgentMappers } from "./src/modules/externalAgents/codegen";
import { codegenMappers as importMappers } from "./src/modules/imports/codegen";
import { codegenMappers as systemMappers } from "./src/modules/system/codegen";

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
          ...companyMappers,
          ...demoMappers,
          ...employeeMappers,
          ...externalAgentMappers,
          ...importMappers,
          ...systemMappers,
        },
      },
    },
  },
};

export default config;
